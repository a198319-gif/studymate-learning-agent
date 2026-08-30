package com.scg.scgpicturebackend.model.enums;

import cn.hutool.core.util.ObjUtil;
import lombok.Getter;

import java.util.HashMap;
import java.util.Map;

//用户角色枚举
@Getter
public enum UserRoleEnum {

    USER("User", "user"),
    ADMIN("Administrator", "admin");

    private final String text;

    private final String value;

    UserRoleEnum(String text, String value){
        this.text = text;
        this.value = value;
    }

    //根据值获取枚举
    public static UserRoleEnum getEnumByValue(String value){
        if(ObjUtil.isEmpty(value)){
            return null;
        }
        for (UserRoleEnum roleEnum : UserRoleEnum.values()) {
            if(roleEnum.value.equals(value)){
                return roleEnum;
            }
        }
        return null;
    }
}
