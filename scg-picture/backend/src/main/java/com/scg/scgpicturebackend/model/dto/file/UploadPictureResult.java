package com.scg.scgpicturebackend.model.dto.file;

import lombok.Data;

import java.io.Serializable;

//上传图片结果
@Data
public class UploadPictureResult implements Serializable {

    private String url;

    /**
     * 缩略图 url
     */
    private String thumbnailUrl;

    private String picName;

    private Long picSize;

    private int picWidth;

    private int picHeight;

    //宽高比
    private Double picScale;

    private String picFormat;


    //图片主色调
    private String picColor;

}