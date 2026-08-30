package com.scg.scgpicturebackend.manager.websocket.disruptor;

import cn.hutool.core.thread.ThreadFactoryBuilder;
import com.lmax.disruptor.dsl.Disruptor;
import com.scg.scgpicturebackend.model.entity.Picture;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.annotation.Resource;

//disruptor环形处理器配置类
@Configuration
public class PictureEditEventDisruptorConfig {
    @Resource
    private PictureEditEventWorkHandler  pictureEditEventWorkHandler;

    @Bean("pictureEditEventDisruptor") // 创建一个bean
    public Disruptor<PictureEditEvent> messageModelRingBuffer(){
        //定义ringbuffer的大小
        int bufferSize = 1024 * 256;

        //创建disruptor
        Disruptor<PictureEditEvent> disruptor = new Disruptor<>(
                PictureEditEvent::new, //每次放到缓冲区的数据类型
                bufferSize, //缓冲区大小
                ThreadFactoryBuilder.create().setNamePrefix("pidtureEditEventDisruptor").build()  //线程工厂
        );

        //设置disruptor的消费者
        disruptor.handleEventsWithWorkerPool(pictureEditEventWorkHandler);
        //启动disruptor
        disruptor.start();
        return disruptor;
    }
}
