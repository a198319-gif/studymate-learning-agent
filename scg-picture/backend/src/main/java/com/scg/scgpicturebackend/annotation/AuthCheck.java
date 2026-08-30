package com.scg.scgpicturebackend.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

//权限控制注解类 配合aop使用
@Target({ElementType.METHOD}) //指定注解生效范围 方法
@Retention(RetentionPolicy.RUNTIME) //运行时生效
public @interface AuthCheck {

    //必须具有某个角色
    String mustRole() default "";
}
