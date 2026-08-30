package com.scg.scgpicturebackend.manager;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.exception.CosClientException;
import com.qcloud.cos.exception.CosServiceException;
import com.qcloud.cos.model.COSObject;
import com.qcloud.cos.model.GetObjectRequest;
import com.qcloud.cos.model.PutObjectRequest;
import com.qcloud.cos.model.PutObjectResult;
import com.qcloud.cos.model.ciModel.persistence.PicOperations;
import com.scg.scgpicturebackend.config.CosClientConfig;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

@Component
public class CosManager {

    @Resource
    private CosClientConfig cosClientConfig;

    @Resource
    private COSClient cosClient;


    /**
     * 上传文件 腾讯云cos
     * @param key 唯一键
     * @param file 文件

     */
    public PutObjectResult putObject(String key, File file){
        PutObjectRequest putObjectRequest = new PutObjectRequest(cosClientConfig.getBucket(), key, file);
        return cosClient.putObject(putObjectRequest);
    }

    /**
     * 获取文件 腾讯云cos
     * @param key 唯一键

     */
    public COSObject getObject(String key){
        GetObjectRequest getObjectRequest = new GetObjectRequest(cosClientConfig.getBucket(), key);
        return cosClient.getObject(getObjectRequest);
    }

    /**
     * 上传并解析图片的方法 附带图片信息
     */
    public PutObjectResult putPictureObject(String key, File file){
        PutObjectRequest putObjectRequest = new PutObjectRequest(cosClientConfig.getBucket(), key, file);
        //对图片进行处理 数据万象提供的方法 也是腾讯云的sdk  这里获取图片基本信息
        PicOperations picOperations = new PicOperations();
        //1.表示返回原图信息
        picOperations.setIsPicInfo(1);

        /*1. 图片压缩（转成webp格式）*/
        List<PicOperations.Rule> rules = new ArrayList<>();
        String webpKey = FileUtil.mainName(key)+".webp";
        //构造请求参数 cos数据万象提供的配置 不用特意去记
        PicOperations.Rule compressRule = new PicOperations.Rule();
        compressRule.setFileId(webpKey);
        compressRule.setBucket(cosClientConfig.getBucket());
        compressRule.setRule("imageMogr2/format/webp");
        rules.add(compressRule);

        /*2. 缩略图处理 规则; 仅对大于20kb的图片生成缩略图*/
        if(file.length()>2*1024){
            PicOperations.Rule thumbnaiRule = new PicOperations.Rule();

            //缩略图名称拼接
            String thumbnailKey = FileUtil.mainName(key)+"_thumbnail." +
                    ((StrUtil.isNotBlank(FileUtil.getSuffix(key)))?FileUtil.getSuffix(key):"webp");
            thumbnaiRule.setFileId(thumbnailKey);

            thumbnaiRule.setBucket(cosClientConfig.getBucket());
            //缩放规则 缩放为256*256 cos帮助问题有 /thumbnail/<Width>x<height> 如果大于原图宽高，不处理
            thumbnaiRule.setRule(String.format("imageMogr2/thumbnail/%sx%s>",256,256));
            rules.add(thumbnaiRule);
        }

        //构造处理函数
        picOperations.setRules(rules);
        putObjectRequest.setPicOperations(picOperations);

        return cosClient.putObject(putObjectRequest);
    }

    //删除对象
    public void deleteObject(String key){
        cosClient.deleteObject(cosClientConfig.getBucket(),key);
    }
}
