package com.scg.scgpicturebackend.model.enums;

import cn.hutool.core.util.ObjUtil;
import lombok.Getter;

//图片审核枚举类
@Getter
public enum PictureReviewStatusEnum {

    REVIEWING("Pending Review", 0),
    PASS("Approved", 1),
    REJECT("Rejected", 2);

    private final String text;

    private final int value;

    PictureReviewStatusEnum(String text, int value) {
        this.text = text;
        this.value = value;
    }

    /**
     * 根据 value 获取枚举
     *
     * @param value 枚举值的 value
     * @return 枚举值
     */
    public static PictureReviewStatusEnum getEnumByValue(Integer value) {
        if (ObjUtil.isEmpty(value)) {
            return null;
        }
        for (PictureReviewStatusEnum pictureReviewStatusEnum : PictureReviewStatusEnum.values()) {
            if (pictureReviewStatusEnum.value == value) {
                return pictureReviewStatusEnum;
            }
        }
        return null;
    }
}