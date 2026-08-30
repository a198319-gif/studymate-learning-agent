package com.scg.scgpicturebackend.common;

import lombok.Data;

//分页请求类
@Data
public class PageRequest {

    private int current = 1;  //当前页号

    private int pageSize = 10; //每页大小

    private String sortField; //排序字段

    private String sortOrder = "descend"; //排序顺序，默认升序

}
