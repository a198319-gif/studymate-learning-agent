package com.scg.scgpicturebackend.model.vo;

import lombok.Data;

import java.util.List;

//返回给前端的标签列表和分类列表
@Data
public class PictureTagCategory {
    private List<String> tagList;

    private List<String> categoryList;
}
