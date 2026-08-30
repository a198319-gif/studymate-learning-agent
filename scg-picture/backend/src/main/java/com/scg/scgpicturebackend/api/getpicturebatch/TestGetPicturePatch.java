package com.scg.scgpicturebackend.api.getpicturebatch;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.scg.scgpicturebackend.constant.UrlConstant;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Slf4j
@Component
public class TestGetPicturePatch {
    public static void main(String[] args) {
        long start = System.currentTimeMillis();
        Elements imgElementList = StartGetPictureBatch.getPicturebatch(UrlConstant.BING_PICTURE_URL, "初音");
        imgElementList.stream().forEach(imgElement -> {
            System.out.println(StartGetPictureBatch.processPictureUrl(imgElement));
        });
        long end = System.currentTimeMillis();
        System.out.println("spend Time:" + (end - start));

    }
}
