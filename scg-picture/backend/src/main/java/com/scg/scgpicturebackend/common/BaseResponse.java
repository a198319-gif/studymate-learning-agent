package com.scg.scgpicturebackend.common;

import com.scg.scgpicturebackend.exception.ErrorCode;
import lombok.Data;

import java.io.Serializable;

@Data
//基础封装类 后端响应前端要响应什么内容 Serializable序列化 为了在各种情况都可以传输
public class BaseResponse<T> implements Serializable {
    private int code;  //状态码

    private T data; //返回的数据内容

    private String message;

    public BaseResponse(int code, T data, String message) {
        this.code = code;
        this.data = data;
        this.message = message;
    }

    public BaseResponse(int code, T data) {
        this(code,data,"");
    }

    //异常响应内容
    public BaseResponse(ErrorCode errorCode) {
        this(errorCode.getCode(),null,errorCode.getMessage());
    }
}
