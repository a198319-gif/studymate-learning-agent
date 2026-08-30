package com.scg.scgpicturebackend.manager.upload;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.NumberUtil;
import cn.hutool.core.util.RandomUtil;
import com.qcloud.cos.model.PutObjectResult;
import com.qcloud.cos.model.ciModel.persistence.CIObject;
import com.qcloud.cos.model.ciModel.persistence.ImageInfo;
import com.qcloud.cos.model.ciModel.persistence.ProcessResults;
import com.scg.scgpicturebackend.config.CosClientConfig;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import com.scg.scgpicturebackend.manager.CosManager;
import com.scg.scgpicturebackend.model.dto.file.UploadPictureResult;
import lombok.extern.slf4j.Slf4j;

import javax.annotation.Resource;
import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Arrays;
import java.util.Date;
import java.util.List;

//上传图片模板方法类 用来定义公共的地方
@Slf4j
public abstract class PictureUploadTemplate {

    @Resource
    private CosClientConfig cosClientConfig;

    @Resource
    private CosManager cosManager;


    /**
     * 上传图片方法
     * 该方法负责将一个multipart文件上传到指定路径，并返回上传结果
     *
     * @param inputSource 图片文件，通常来源于HTTP请求中的文件上传部分
     * @param uploadPathPrefix 上传路径前缀，用于指定文件保存的目录或路径
     * @return 返回一个UploadPictureResult对象，包含上传结果和相关信息
     */
    public UploadPictureResult uploadPicture(Object inputSource, String uploadPathPrefix){
        //1. 校验图片
        ValidPicture(inputSource);

        //2. 图片上传地址
        /*更改原图片名字 最终上传的文件不等于原始图片名称*/
        String uuid = RandomUtil.randomString(16);
        //获取原始文件名
        String originalFilename = getOriginalFilename(inputSource);

        //自己拼接文件上传路径，不是使用原始文件名称，增加安全性
        String uploadFilename = String.format("%s_%s.%s", DateUtil.formatDate(new Date()),uuid,
                FileUtil.getSuffix(originalFilename));
        String uploadPath = String.format("/%s/%s",uploadPathPrefix,uploadFilename);

        //解析结果并返回
        File file = null;
        try {
            //3. 创建临时文件，并获取文件到服务器
            file = File.createTempFile(uploadPath,null);
            /*处理文件来源*/
            processFile(inputSource,file);
            /*4. 调用cos的管理类 把文件上传到cos中*/
            PutObjectResult putObjectResult = cosManager.putPictureObject(uploadPath, file);

            /*5. 解析上传图片信息 封装返回结果*/
            ImageInfo imageInfo = putObjectResult.getCiUploadResult().getOriginalInfo().getImageInfo();

            /*获取图片处理结果*/
            ProcessResults processResults = putObjectResult.getCiUploadResult().getProcessResults();
            List<CIObject> objectList = processResults.getObjectList();
            if(CollUtil.isNotEmpty(objectList)){
                //获取压缩之后得到的文件信息（压缩图，和缩略图 一共就俩值 就取0和1即可）
                CIObject compressedCiObject = objectList.get(0);
                //缩略图默认是压缩图
                CIObject thumbnailCiObject = compressedCiObject;

                //有缩略图 才保存缩略图
                if(objectList.size()>1){
                    thumbnailCiObject = objectList.get(1);
                }

                //封装压缩图的返回结果
                return buildResult(originalFilename,compressedCiObject,thumbnailCiObject,imageInfo);
            }
            //构造返回结果
            return buildResult(imageInfo, uploadPath, originalFilename, file);
        } catch (Exception e) {
            log.error("图片上传到对象存储失败",e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR,"上传失败");
        }finally {
            //6，结束后 删除本地临时文件
            this.deleteTempFile(file);
        }
    }



    //获取原始文件名
    protected abstract String getOriginalFilename(Object inputSource);

    //处理文件来源并生成本地临时文件
    protected abstract void processFile (Object inputSource,File file)  throws Exception;

    //校验输入源
    protected abstract void ValidPicture(Object inputSource);

    /**
     * 构建返回结果
     * @param imageInfo 图片信息
     * @param uploadPath 上传地址
     * @param originalFilename 原始文件名
     * @param file 文件
     * @return
     */
    private UploadPictureResult buildResult(ImageInfo imageInfo, String uploadPath, String originalFilename, File file) {
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
        uploadPictureResult.setPicColor(imageInfo.getAve()); //获取图片主色调 cos提供


        //返回可访问的地址
        return uploadPictureResult;
    }

    /**
     * 构建返回结果压缩后的
     * @return
     */
    private UploadPictureResult buildResult(String originalFilename,
                                            CIObject compressedCiObject,
                                            CIObject thumbnailCiObject,
                                            ImageInfo imageInfo) {
        int picWidth = compressedCiObject.getWidth();
        int picHeight = compressedCiObject.getHeight();
        //计算宽高比
        double picScale = NumberUtil.round(picWidth*1.0/picHeight,2).doubleValue();

        /*封装返回结果*/
        UploadPictureResult uploadPictureResult = new UploadPictureResult();
        //压缩后的原图地址
        uploadPictureResult.setUrl(cosClientConfig.getHost() + "/" + compressedCiObject.getKey()); //上传到cos 要拼接host
        uploadPictureResult.setPicName(FileUtil.mainName(originalFilename)); //获取图片原始名
        uploadPictureResult.setPicSize(compressedCiObject.getSize().longValue());
        uploadPictureResult.setPicWidth(picWidth);
        uploadPictureResult.setPicHeight(picHeight);
        uploadPictureResult.setPicScale(picScale);
        uploadPictureResult.setPicFormat(compressedCiObject.getFormat());
        //缩略图地址
        uploadPictureResult.setThumbnailUrl(cosClientConfig.getHost() + "/" + thumbnailCiObject.getKey());

        uploadPictureResult.setPicColor(imageInfo.getAve()); //获取图片主色调 cos提供


        //返回可访问的地址
        return uploadPictureResult;
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
}
