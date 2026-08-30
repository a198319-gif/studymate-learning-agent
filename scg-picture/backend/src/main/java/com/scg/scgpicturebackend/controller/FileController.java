package com.scg.scgpicturebackend.controller;

import com.qcloud.cos.model.COSObject;
import com.qcloud.cos.model.COSObjectInputStream;
import com.qcloud.cos.utils.IOUtils;
import com.scg.scgpicturebackend.annotation.AuthCheck;
import com.scg.scgpicturebackend.common.BaseResponse;
import com.scg.scgpicturebackend.common.ResultUtils;
import com.scg.scgpicturebackend.constant.UserConstant;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.manager.CosManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.io.IOException;

@RestController
@RequestMapping("/file")
@Slf4j
public class FileController {

    @Resource
    private CosManager cosManager;

    @PostMapping("/test/delete")
    public BaseResponse<Boolean> testDeleteFile(String filepath) {
        cosManager.deleteObject(filepath);
        return ResultUtils.success(true);
    }


    //测试文件上传 使用requestpart接收前端参数
    @PostMapping("/test/upload")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<String> testUploadFile(@RequestPart("file")MultipartFile multipartFile) {
        //指定要上传到cos的文件目录 存储到test目录下
        String filename = multipartFile.getOriginalFilename();
        String filepath = String.format("/test/%s",filename); // %s格式化填充数据

        File file = null;
        try {
            //上传文件 先根据文件路径创建一个临时文件
            file = File.createTempFile(filepath,null);
            /*把前端给的文件传输到本地临时文件*/
            multipartFile.transferTo(file);
            /*调用cos的管理类 把文件上传到cos中*/
            cosManager.putObject(filepath, file);
            //返回可访问的地址
            return ResultUtils.success(filepath);
        } catch (Exception e) {
            log.error("file upload error, filepath = " + filepath,e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR,"Upload failed");
        }finally {
            //结束后 删除本地临时文件
            if(file != null){
                boolean delete = file.delete();
                if(!delete){
                    log.error("file delete error, filepath = {}" , filepath);
                }
            }
        }
    }

    //测试文件下载
    @PostMapping("/test/download")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public void testDownLoadFile(String filepath, HttpServletResponse response){
        COSObjectInputStream cosObjectInput = null;
        try {
            COSObject cosObject = cosManager.getObject(filepath);
            cosObjectInput = cosObject.getObjectContent();

            byte[] bytes = IOUtils.toByteArray(cosObjectInput);

            /*设置响应头为stream 告诉浏览器要下载文件*/
            /*虽然这个方法是void 但是最底层本质就是servlet 所以这个response会被写回 不管什么情况都会有这个response*/
            response.setContentType("application/octet-stream;charset=UTF-8");
            response.setHeader("Content-Disposition","attachment;filename=" + filepath);

            /*写入响应 刷新响应头*/
            response.getOutputStream().write(bytes);
            response.getOutputStream().flush();
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR,"Download failed");
        }finally {
            if(cosObjectInput != null){
                cosObjectInput.release();
            }
        }

    }
}
