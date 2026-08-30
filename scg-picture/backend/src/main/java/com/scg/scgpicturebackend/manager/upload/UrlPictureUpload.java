package com.scg.scgpicturebackend.manager.upload;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpResponse;
import cn.hutool.http.HttpStatus;
import cn.hutool.http.HttpUtil;
import cn.hutool.http.Method;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import org.springframework.stereotype.Service;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Arrays;
import java.util.List;

//url图片上传
@Service
public class UrlPictureUpload extends PictureUploadTemplate {
    @Override
    protected String getOriginalFilename(Object inputSource) {
        String fileUrl = (String) inputSource;
        return FileUtil.mainName(fileUrl);
    }

    @Override
    protected void processFile(Object inputSource, File file) throws Exception {
        String fileUrl = (String) inputSource;
        //下载文件到临时目录
        HttpUtil.downloadFile(fileUrl,file);
    }

    @Override
    protected void ValidPicture(Object inputSource) {
        String fileUrl = (String) inputSource;
        //校验非空
        ThrowUtils.throwIf(StrUtil.isBlank(fileUrl), ErrorCode.PARAMS_ERROR,"File URL is empty");

        //校验url格式 使用java自带的url类进行校验 如果地址不正确的话会报错
        try {
            new URL(fileUrl);
        } catch (MalformedURLException e) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR,"Invalid file URL");
        }

        //校验 url 协议
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
