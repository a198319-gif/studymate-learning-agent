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
public class BiZhiHuiPictureBatch implements GetPictureBatchStrategy {
    @Override
    public Elements getPictureBatch(String url,String searchText) {
            String fetchUrl = String.format("https://www.bizhihui.com/search.php?q=%s", searchText);
            //调用jsoup
            Document document = null;
            try {
                document = Jsoup.connect(fetchUrl).get();
            } catch (IOException e) {
                log.error("获取页面失败",e);
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"获取页面失败");
            }

            //解析内容
            //解析内容
            Element div = document.getElementsByClass("clear").first();
            if(ObjUtil.isEmpty(div)){
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"获取元素失败");
            }
            Elements imgElementList = div.select("img");
            return imgElementList;
    }
    @Override
    public String processPictureUrl(Element imgElement) {
        String fileUrl = imgElement.attr("src");
        if(StrUtil.isBlank(fileUrl)){
            log.info("当前链接为空，已跳过：{}",fileUrl);
            return null;
        }
        String realUrl = fileUrl;
        //处理图片的url 壁纸汇图片地址后面会拼接thumbs 要去掉
        if (fileUrl.contains("-pcthumbs")) {
            realUrl = fileUrl.replace("-pcthumbs", "");
        }
        return realUrl;
    }
}
