package com.scg.scgpicturebackend.utils;

import com.google.common.util.concurrent.ThreadFactoryBuilder;

import java.util.concurrent.*;

public class ExecutorUtils {
    public static final String IO_TASK = "io";
    public static final String CPU_TASK = "cpu";

    /**
     * 自定义的线程池工厂 实现自定义的设置线程池参数算法
     * @param taskCount 任务数量
     * @param taskName 任务名
     * @param taskType 任务类型 io密集型/cpu密集型
     * @return
     */
    public static ExecutorService createDynamicUploadExecutor(int taskCount,String taskName,String taskType) {
        int corePoolSize;
        int maxPoolSize;
        if (IO_TASK.equals(taskType)) {
            //IO密集型 2N+1（概念）
             corePoolSize = Math.min(4, taskCount / 2);
             maxPoolSize = Math.min(20, taskCount + 5);
        }else{
            //cpu密集型 N+1（概念） 这块暂时这么写 目前服务器核心数是2 后续如果有实际情况再实际考虑怎么设计
            corePoolSize = 2;
            maxPoolSize = 3;
        }

        return new ThreadPoolExecutor(
                corePoolSize, //核心线程数
                maxPoolSize, //最大线程数
                60L, //空闲线程存活时间
                TimeUnit.SECONDS, //时间单位 秒
                new ArrayBlockingQueue<>(taskCount), //这里使用有界的阻塞队列 数量就为任务数即可
                new ThreadFactoryBuilder().setNameFormat(taskName+"-%d").build(),
                new ThreadPoolExecutor.CallerRunsPolicy()
        );
    }
}
