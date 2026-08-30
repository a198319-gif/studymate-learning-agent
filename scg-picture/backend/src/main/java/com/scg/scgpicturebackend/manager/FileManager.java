package com.scg.scgpicturebackend.manager;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.NumberUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpResponse;
import cn.hutool.http.HttpStatus;
import cn.hutool.http.HttpUtil;
import cn.hutool.http.Method;
import com.qcloud.cos.model.PutObjectResult;
import com.qcloud.cos.model.ciModel.persistence.ImageInfo;
import com.scg.scgpicturebackend.common.ResultUtils;
import com.scg.scgpicturebackend.config.CosClientConfig;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import com.scg.scgpicturebackend.model.dto.file.UploadPictureResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

/*老文件上传类，图片上传和url上传都混在一起 迁移到upload文件夹中 使用模板方法重构了 此方法废弃*/
@Deprecated
@Service
@Slf4j
public class FileManager {

    @Resource
    private CosClientConfig cosClientConfig;

    @Resource
    private CosManager cosManager;


    /**
     * 上传图片方法
     * 该方法负责将一个multipart文件上传到指定路径，并返回上传结果
     *
     * @param multipartFile 图片文件，通常来源于HTTP请求中的文件上传部分
     * @param uploadPathPrefix 上传路径前缀，用于指定文件保存的目录或路径
     * @return 返回一个UploadPictureResult对象，包含上传结果和相关信息
     */
    public UploadPictureResult uploadPicture(MultipartFile multipartFile, String uploadPathPrefix){
        //校验图片
        ValidPicture(multipartFile);

        //图片上传地址
        /*更改原图片名字 最终上传的文件不等于原始图片名称*/
        String uuid = RandomUtil.randomString(16);
        String originalFilename = multipartFile.getOriginalFilename();

        //自己拼接文件上传路径，不是使用原始文件名称，增加安全性
        String uploadFilename = String.format("%s_%s.%s", DateUtil.formatDate(new Date()),uuid,
                FileUtil.getSuffix(originalFilename));
        String uploadPath = String.format("/%s/%s",uploadPathPrefix,uploadFilename);

        //解析结果并返回
        File file = null;
        try {
            //上传文件 先根据文件路径创建一个临时文件
            file = File.createTempFile(uploadPath,null);
            /*把前端给的文件传输到本地临时文件*/
            multipartFile.transferTo(file);
            /*调用cos的管理类 把文件上传到cos中*/
            PutObjectResult putObjectResult = cosManager.putPictureObject(uploadPath, file);

            /*解析上传图片信息*/
            ImageInfo imageInfo = putObjectResult.getCiUploadResult().getOriginalInfo().getImageInfo();
            int picWidth = imageInfo.getWidth();
            int picHeight = imageInfo.getHeight();
            //计算宽高比
            double picScale = NumberUtil.round(picWidth*1.0/picHeight,2).doubleValue();


            /*封装返回结果*/
            UploadPictureResult uploadPictureResult = new UploadPictureResult();
            uploadPictureResult.setUrl(cosClientConfig.getHost() + "/" + uploadPath); //上传到cos 要拼接host
            uploadPictureResult.setPicName(FileUtil.mainName(originalFilename)); //获取图片原始名
            uploadPictureResult.setPicSize(FileUtil.size(file));
            uploadPictureResult.setPicWidth(picWidth);
            uploadPictureResult.setPicHeight(picHeight);
            uploadPictureResult.setPicScale(picScale);
            uploadPictureResult.setPicFormat(imageInfo.getFormat());


            //返回可访问的地址
            return uploadPictureResult;
        } catch (Exception e) {
            log.error("图片上传到对象存储失败",e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR,"Upload failed");
        }finally {
            //结束后 删除本地临时文件
            this.deleteTempFile(file);
        }
    }

    //删除本地临时文件
    public static void deleteTempFile(File file) {
        if(file != null){
            boolean deleteResult = file.delete();
            if(!deleteResult){
                log.error("file delete error, filepath = {}" , file.getAbsolutePath());
            }
        }
    }

    //校验文件
    private void ValidPicture(MultipartFile multipartFile) {
        ThrowUtils.throwIf(multipartFile == null, ErrorCode.PARAMS_ERROR,"Uploaded file is empty");
    
        //校验文件大小
        long fileSize = multipartFile.getSize();
        final long ONE_M = 1024 * 1024;
        ThrowUtils.throwIf(fileSize > 30 * ONE_M, ErrorCode.PARAMS_ERROR,"File size cannot exceed 30M");
    
        //校验文件后缀
        String fileSuffix = FileUtil.getSuffix(multipartFile.getOriginalFilename());
        //允许上传的文件后缀列表
        final List<String> ALLOW_FORMAT_LIST = Arrays.asList("jpg","jpeg","png","webp");
        ThrowUtils.throwIf(!ALLOW_FORMAT_LIST.contains(fileSuffix), ErrorCode.PARAMS_ERROR,"Unsupported file format");
    }

    //todo 新增url上传图片
    public UploadPictureResult uploadPictureByUrl(String fileUrl, String uploadPathPrefix){
        //校验图片url
        //todo 根据url校验图片
        ValidPicture(fileUrl);

        //图片上传地址
        /*更改原图片名字 最终上传的文件不等于原始图片名称*/
        String uuid = RandomUtil.randomString(16);
        //todo 使用hotoool工具类获取图片名
        String originalFilename = FileUtil.mainName(fileUrl);

        //自己拼接文件上传路径，不是使用原始文件名称，增加安全性
        String uploadFilename = String.format("%s_%s.%s", DateUtil.formatDate(new Date()),uuid,
                FileUtil.getSuffix(originalFilename));
        String uploadPath = String.format("/%s/%s",uploadPathPrefix,uploadFilename);

        //解析结果并返回
        File file = null;
        try {
            //上传文件 先根据文件路径创建一个临时文件
            file = File.createTempFile(uploadPath,null);

            /*用huttol工具包 下载文件*/
            HttpUtil.downloadFile(fileUrl,file);

            /*调用cos的管理类 把文件上传到cos中*/
            PutObjectResult putObjectResult = cosManager.putPictureObject(uploadPath, file);

            /*解析上传图片信息*/
            ImageInfo imageInfo = putObjectResult.getCiUploadResult().getOriginalInfo().getImageInfo();
            int picWidth = imageInfo.getWidth();
            int picHeight = imageInfo.getHeight();
            //计算宽高比
            double picScale = NumberUtil.round(picWidth*1.0/picHeight,2).doubleValue();


            /*封装返回结果*/
            UploadPictureResult uploadPictureResult = new UploadPictureResult();
            uploadPictureResult.setUrl(cosClientConfig.getHost() + "/" + uploadPath); //上传到cos 要拼接host
            uploadPictureResult.setPicName(FileUtil.mainName(originalFilename)); //获取图片原始名
            uploadPictureResult.setPicSize(FileUtil.size(file));
            uploadPictureResult.setPicWidth(picWidth);
            uploadPictureResult.setPicHeight(picHeight);
            uploadPictureResult.setPicScale(picScale);
            uploadPictureResult.setPicFormat(imageInfo.getFormat());


            //返回可访问的地址
            return uploadPictureResult;
        } catch (Exception e) {
            log.error("图片上传到对象存储失败",e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR,"Upload failed");
        }finally {
            //结束后 删除本地临时文件
            this.deleteTempFile(file);
        }
    }
    
    //根据 url 校验文件
    private void ValidPicture(String fileUrl) {
        //校验非空
        ThrowUtils.throwIf(StrUtil.isBlank(fileUrl), ErrorCode.PARAMS_ERROR,"File URL is empty");

        //校验url格式 使用java自带的url类进行校验 如果地址不正确的话会报错
        try {
            new URL(fileUrl);
        } catch (MalformedURLException e) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR,"Invalid file URL");
        }

        //校验url协议
        ThrowUtils.throwIf(!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://"),
                ErrorCode.PARAMS_ERROR,"Only HTTP or HTTPS protocol is supported");

        /*发送head请求，验证文件是否存在 使用huttol工具包*/
        HttpResponse httpResponse = null;
        try{
            /*head请求只返回http响应头信息，不会下载文件内容*/
            httpResponse = HttpUtil.createRequest(Method.HEAD, fileUrl).execute();

            //未正常返回，无需执行其他判断 有些务器不支持head请求，所以这个如果没有正常返回不应该抛出异常
            if(httpResponse.getStatus() != HttpStatus.HTTP_OK){
                return;
            }

            /*文件存在，文件类型校验 从请求头中拿到type 这个就是文件类型*/
            String contenType = httpResponse.header("Content-Type");
            if(StrUtil.isNotBlank(contenType)){
                //允许的图片类型
                final List<String> ALLOW_FORMAT_LIST = Arrays.asList("image/jpeg","image/png","image/webp");
                ThrowUtils.throwIf(!ALLOW_FORMAT_LIST.contains(contenType), ErrorCode.PARAMS_ERROR,"Unsupported file type");
            }

            /*文件存在，文件大小校验 这个是请求头中保存的文件的大小*/
            String contentLengthStr = httpResponse.header("Content-Length");
            if(StrUtil.isNotBlank(contentLengthStr)){
                try{
                    long contentLength = Long.parseLong(contentLengthStr);
                    final long ONE_M = 1024 * 1024;
                    ThrowUtils.throwIf(contentLength > 30 * ONE_M, ErrorCode.PARAMS_ERROR,"File size cannot exceed 30M");
                }catch (NumberFormatException e){
                    throw new BusinessException(ErrorCode.PARAMS_ERROR,"Invalid file size");
                }
            }

        }finally {
            //释放资源，否则可能占用连接
            if(httpResponse != null){
                httpResponse.close();
            }
        }
    }
}
