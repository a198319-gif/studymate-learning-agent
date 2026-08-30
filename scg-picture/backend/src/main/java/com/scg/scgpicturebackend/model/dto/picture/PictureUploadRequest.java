package com.scg.scgpicturebackend.model.dto.picture;

import lombok.Data;

import java.io.Serializable;

//图片上传请求
@Data
public class PictureUploadRequest implements Serializable {
    /**
     * 图片 id（用于修改）
     */
    private Long id;

    //文件地址 选择url上传用
    private String fileUrl;

    //图片名称 用于批量上传定义图片名用
    private String picName;

    /**
     * 空间 id（为空表示公共空间）
     */
    private Long spaceId;

    private static final long serialVersionUID = 1L;
}