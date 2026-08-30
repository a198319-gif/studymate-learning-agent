package com.scg.scgpicturebackend.api.aliyunai;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONUtil;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskRequest;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskResponse;
import com.scg.scgpicturebackend.api.aliyunai.model.GetOutPaintingTaskResponse;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// 调用阿里云api类
@Slf4j
@Component
public class AliYunAiApi {

    //获取配置文件中的配置
    @Value("${aliYunAi.apiKey}")
    private String apiKey;

    //创建任务地址 和 查询任务状态地址（从接口文档中可以找到）
    public static final String CREATE_OUT_PAINTING_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/out-painting";
    // %s 用来占位
    public static final String GET_OUT_PAINTING_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/%s";

    //创建任务
    public CreateOutPaintingTaskResponse createOutPaintingTask(CreateOutPaintingTaskRequest createOutPaintingTaskRequest) {

        if  (createOutPaintingTaskRequest == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "参数为空");
        }

        //发送请求
        // curl --location --request POST 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/out-painting' \
        //--header "Authorization: Bearer $DASHSCOPE_API_KEY" \
        //--header 'X-DashScope-Async: enable' \
        //--header 'Content-Type: application/json' \
        //--data '{
        //    "model": "image-out-painting",
        //    "input": {
        //        "image_url": "http://xxx/image.jpg"
        //    },
        //    "parameters":{
        //        "angle": 45,
        //        "x_scale":1.5,
        //        "y_scale":1.5
        //    }
        //}'
        HttpRequest httpRequest = HttpRequest.post(CREATE_OUT_PAINTING_TASK_URL)
                .header("Authorization", "Bearer " + apiKey)
                 //必须开启异步处理
                .header("X-DashScope-Async", "enable")
                .header("Content-Type", "application/json")
                .body(JSONUtil.toJsonStr(createOutPaintingTaskRequest));

        //处理响应 在try括号中处理会自动释放资源
        try (HttpResponse httpResponse = httpRequest.execute()){

            if(!httpResponse.isOk()){
                log.error("请求异常：{}",httpResponse.body());
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"AI扩图失败");
            }
            //把拿到的body体的转换成实体类形式
            CreateOutPaintingTaskResponse createOutPaintingTaskResponse = JSONUtil.toBean(httpResponse.body(), CreateOutPaintingTaskResponse.class);
            if(createOutPaintingTaskResponse.getCode() != null){
                log.error("请求异常：{}",createOutPaintingTaskResponse.getMessage());
                throw new BusinessException(ErrorCode.OPERATION_ERROR,"AI扩图失败");
            }
            return createOutPaintingTaskResponse;
        }
    }

    public static final String TEXT_TO_IMAGE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

    public String generatePicture(String prompt) {
        if (StrUtil.isBlank(prompt)) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR, "Prompt cannot be empty");
        }
        String body = JSONUtil.createObj()
                .set("model", "qwen-image-2.0")
                .set("input", JSONUtil.createObj()
                        .set("messages", JSONUtil.createArray()
                                .set(JSONUtil.createObj()
                                        .set("role", "user")
                                        .set("content", JSONUtil.createArray()
                                                .set(JSONUtil.createObj().set("text", prompt))))))
                .set("parameters", JSONUtil.createObj().set("size", "1024*1024").set("n", 1))
                .toString();
        try (HttpResponse httpResponse = HttpRequest.post(TEXT_TO_IMAGE_URL)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .body(body)
                .execute()) {
            if (!httpResponse.isOk()) {
                log.error("Text-to-image request failed: {}", httpResponse.body());
                throw new BusinessException(ErrorCode.OPERATION_ERROR, "AI image generation failed");
            }
            String imageUrl = JSONUtil.parseObj(httpResponse.body())
                    .getByPath("output.choices[0].message.content[0].image", String.class);
            if (StrUtil.isBlank(imageUrl)) {
                log.error("Text-to-image response parse failed: {}", httpResponse.body());
                throw new BusinessException(ErrorCode.OPERATION_ERROR, "AI image generation failed");
            }
            return imageUrl;
        }
    }

    //查询任务结果
    public GetOutPaintingTaskResponse getOutPaintingTask(String taskId){
        if (StrUtil.isBlank(taskId)) {
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "任务 ID 不能为空");
        }
        // 处理响应 替换占位符为传入的taskId
        String url = String.format(GET_OUT_PAINTING_TASK_URL, taskId);
        //请求api接口
        try (HttpResponse httpResponse = HttpRequest.get(url)
                .header("Authorization", "Bearer " + apiKey)
                .execute()) {

            if (!httpResponse.isOk()) {
                log.error("请求异常：{}", httpResponse.body());
                throw new BusinessException(ErrorCode.OPERATION_ERROR, "获取任务结果失败");
            }
            return JSONUtil.toBean(httpResponse.body(), GetOutPaintingTaskResponse.class);
        }
    }
}
