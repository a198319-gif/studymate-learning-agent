package com.scg.scgpicturebackend.model.dto.user;

import lombok.Data;

import java.io.Serializable;

//用户注册请求
@Data
public class UserRegisterRequest implements Serializable {

    //序列化过程中通过这个值判断是否一致 防止序列化对象被修改
    private static final long serialVersionUID = -5863342784754342621L;

    private String userAccount; //账号

    private String userPassword; //密码

    private String checkPassword; //确认密码


}
