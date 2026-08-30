package com.scg.scgpicturebackend;

import org.apache.shardingsphere.spring.boot.ShardingSphereAutoConfiguration;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication(exclude = {ShardingSphereAutoConfiguration.class})
@EnableAsync //开启异步支持
@MapperScan("com.scg.scgpicturebackend.mapper") //开启mapper扫描 不然mybatisplus不生效
@EnableAspectJAutoProxy(exposeProxy = true)  //开启aop代理支持
public class ScgPictureBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(ScgPictureBackendApplication.class, args);
    }

}
