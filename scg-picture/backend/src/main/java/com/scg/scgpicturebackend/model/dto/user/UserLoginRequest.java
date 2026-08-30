package com.scg.scgpicturebackend.model.dto.user;

import lombok.Data;

import java.io.Serializable;

//用户登录请求
@Data
public class UserLoginRequest implements Serializable {

    //序列化过程中通过这个值判断是否一致 防止序列化对象被修改
    private static final long serialVersionUID = -5863342784754342621L;

    private String userAccount; //账号

    private String userPassword; //密码



}
