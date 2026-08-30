package com.scg.scgpicturebackend.model.dto.space;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 空间级别
 */
@Data
@AllArgsConstructor //构造函数
public class SpaceLevel {

    /**
     * 值
     */
    private int value;

    /**
     * 中文描述
     */
    private String text;

    /**
     * 最大数量
     */
    private long maxCount;

    /**
     * 最大容量
     */
    private long maxSize;
}