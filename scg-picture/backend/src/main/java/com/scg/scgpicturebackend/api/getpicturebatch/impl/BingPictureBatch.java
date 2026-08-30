package com.scg.scgpicturebackend.api.getpicturebatch.impl;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.scg.scgpicturebackend.api.getpicturebatch.GetPictureBatchStrategy;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.io.IOException;
import java.util.concurrent.CompletableFuture;

@Slf4j
public class BingPictureBatch implements GetPictureBatchStrategy {
    @Override
    public Elements getPictureBatch(String url,String searchText) {
        {
            String fetchUrl = String.format("https://cn.bing.com/images/async?q=%S&mmasync=1", searchText);
            //调用jsoup
            Document document = null;
            try {
                document = Jsoup.connect(fetchUrl).get();
            } catch (IOException e) {
                log.error("获取页面失败",e);
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"获取页面失败");
            }

            //解析内容
            Element div = document.getElementsByClass("dgControl").first();
            if(ObjUtil.isEmpty(div)){
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"获取元素失败");
            }
            Elements imgElementList = div.select("img.mimg");
            return imgElementList;
        }
    }

    @Override
    public String processPictureUrl(Element imgElement) {
        String fileUrl = imgElement.attr("src");
        if(StrUtil.isBlank(fileUrl)){
            log.info("当前链接为空，已跳过：{}",fileUrl);
            return null;
        }
        //处理图片的url 防止转移或和cos存储冲突 因为腾讯云的cos接受不了很长很长的url 所以要把没意义的参数全部截断
        int questionMarkIndex = fileUrl.indexOf("?");
        if(questionMarkIndex > -1){
            fileUrl = fileUrl.substring(0,questionMarkIndex);
        }
        return fileUrl;
    }
}
