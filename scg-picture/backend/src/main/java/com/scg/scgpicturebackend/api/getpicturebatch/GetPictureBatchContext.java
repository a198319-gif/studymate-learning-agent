package com.scg.scgpicturebackend.api.getpicturebatch;

import cn.hutool.core.util.StrUtil;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

public class GetPictureBatchContext {
    private GetPictureBatchStrategy getPictureBatchStrategy;

    public void setStrategy(GetPictureBatchStrategy getPictureBatchStrategy){
        this.getPictureBatchStrategy = getPictureBatchStrategy;
    }

    public Elements getPictureBatch(String url,String searchText){
        ThrowUtils.throwIf(getPictureBatchStrategy == null , ErrorCode.SYSTEM_ERROR,"未指定抓图策略");
        return getPictureBatchStrategy.getPictureBatch(url,searchText);
    }

    public String processPictureUrl(Element imgElement) {
        return getPictureBatchStrategy.processPictureUrl(imgElement);
    }
}
