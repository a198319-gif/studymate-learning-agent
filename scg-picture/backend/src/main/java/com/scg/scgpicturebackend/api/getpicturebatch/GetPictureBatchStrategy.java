package com.scg.scgpicturebackend.api.getpicturebatch;

import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import java.util.concurrent.CompletableFuture;

public interface GetPictureBatchStrategy {

    Elements getPictureBatch(String url,String searchText);

    String processPictureUrl(Element imgElement);
}
