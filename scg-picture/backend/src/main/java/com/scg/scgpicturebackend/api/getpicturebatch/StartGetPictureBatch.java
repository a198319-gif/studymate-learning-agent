package com.scg.scgpicturebackend.api.getpicturebatch;

import com.scg.scgpicturebackend.api.getpicturebatch.impl.BiZhiHuiPictureBatch;
import com.scg.scgpicturebackend.api.getpicturebatch.impl.BingPictureBatch;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

@Slf4j
public class StartGetPictureBatch {

    static GetPictureBatchContext getPictureBatchContext = new GetPictureBatchContext();

    public static Elements getPicturebatch(String url,String searchText){
        //bing抓图
        //getPictureBatchContext.setStrategy(new BingPictureBatch());

        //壁纸汇抓图
        getPictureBatchContext.setStrategy(new BiZhiHuiPictureBatch());

        return getPictureBatchContext.getPictureBatch(url,searchText);

    }
    public static String processPictureUrl(Element imgElement) {
        return getPictureBatchContext.processPictureUrl(imgElement);
    }
}
