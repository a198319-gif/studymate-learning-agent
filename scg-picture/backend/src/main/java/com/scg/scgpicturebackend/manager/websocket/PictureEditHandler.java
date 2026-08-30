package com.scg.scgpicturebackend.manager.websocket;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.json.JSONUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.scg.scgpicturebackend.manager.websocket.disruptor.PictureEditEventProducer;
import com.scg.scgpicturebackend.manager.websocket.model.PictureEditActionEnum;
import com.scg.scgpicturebackend.manager.websocket.model.PictureEditMessageTypeEnum;
import com.scg.scgpicturebackend.manager.websocket.model.PictureEditRequestMessage;
import com.scg.scgpicturebackend.manager.websocket.model.PictureEditResponseMessage;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import javax.annotation.Resource;
import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

//图片编辑 websocket处理器
@Component
@Slf4j
public class PictureEditHandler extends TextWebSocketHandler {

    @Resource
    private UserService userService;

    @Resource
    @Lazy
    private PictureEditEventProducer pictureEditEventProducer;


    // 每张图片的编辑状态，key: pictureId, value: 当前正在编辑的用户 ID
    private final Map<Long, Long> pictureEditingUsers = new ConcurrentHashMap<>();

    // 保存所有连接的会话，key: pictureId, value: 用户会话集合 注意 必须使用并发的hashmap 因为要确保线程安全
    private final Map<Long, Set<WebSocketSession>> pictureSessions = new ConcurrentHashMap<>();

    //建立连接成功后做什么
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        super.afterConnectionEstablished(session);
        //保存会话到集合中
        User user = (User)session.getAttributes().get("user");
        Long pictureId = (Long)session.getAttributes().get("pictureId");
        //如果该图片没有编辑用户，则创建一个空的集合初始化
        pictureSessions.putIfAbsent(pictureId, ConcurrentHashMap.newKeySet());
        pictureSessions.get(pictureId).add(session);

        //构造响应 发送加入编辑的消息通知
        PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
        pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.INFO.getValue());
        String message = String.format("用户 %s 加入编辑", user.getUserName());
        pictureEditResponseMessage.setMessage(message);
        pictureEditResponseMessage.setUser(userService.getUserVO(user)); //脱敏用户信息再发送
        // 广播给所有用户 包括自己
        broadcastToPicture(pictureId, pictureEditResponseMessage);
    }

    //收到前端发送的消息，根据消息类别处理消息
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        super.handleTextMessage(session, message);
        //获取消息内容，把json转换为pictureEditMessage  TextMessage就是前端传来的消息
        PictureEditRequestMessage pictureEditRequestMessage = JSONUtil.toBean(message.getPayload(), PictureEditRequestMessage.class);

        //从session属性中获得公共参数
        User user = (User) session.getAttributes().get("user");
        Long pictureId = (Long) session.getAttributes().get("pictureId");

        //TODO 现在改为使用disruptor 生产消息到disruptor环形队列中
        pictureEditEventProducer.publishEvent(pictureEditRequestMessage, session, user, pictureId);

        //根据传来的操作类型 获取枚举类 然后处理消息
//        String type = pictureEditRequestMessage.getType();
//        PictureEditMessageTypeEnum pictureEditMessageTypeEnum = PictureEditMessageTypeEnum.getEnumByValue(type);

//        switch (pictureEditMessageTypeEnum) {
//            case ENTER_EDIT: //进入编辑状态
//                handlerEnterEditMessage(pictureEditRequestMessage,session,user,pictureId);
//                break;
//            case EXIT_EDIT: //退出编辑
//                handlerExitEditMessage(pictureEditRequestMessage,session,user,pictureId);
//                break;
//            case EDIT_ACTION: //编辑操作
//                handlerEditActionMessage(pictureEditRequestMessage,session,user,pictureId);
//                break;
//            default:
//                //其他消息类型，返回错误提示
//                PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
//                pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.ERROR.getValue());
//                pictureEditResponseMessage.setMessage("未知的消息类型");
//                pictureEditResponseMessage.setUser(userService.getUserVO(user));
//                session.sendMessage(new TextMessage(JSONUtil.toJsonStr(pictureEditResponseMessage)));
//                break;
//        }


    }

    //进入编辑状态
    public void handlerEnterEditMessage(PictureEditRequestMessage pictureEditRequestMessage, WebSocketSession session, User user, Long pictureId) throws IOException {
        //没有用户正在编辑该图片，才能进入编辑 这个集合里如果不存在这张图片的id 说明目前还没人编辑这张图片 可以编辑
        if(!pictureEditingUsers.containsKey(pictureId)){
            //设置该图片正在被谁编辑
            pictureEditingUsers.put(pictureId, user.getId());

            //构造响应 发送加入编辑的消息通知
            PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
            pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.ENTER_EDIT.getValue());
            String message = String.format("用户 %s 开始编辑图片", user.getUserName());
            pictureEditResponseMessage.setMessage(message);
            pictureEditResponseMessage.setUser(userService.getUserVO(user)); //脱敏用户信息再发送
            // 广播给所有用户 包括自己
            broadcastToPicture(pictureId, pictureEditResponseMessage);
        }
    }

    //处理编辑操作
    public void handlerEditActionMessage(PictureEditRequestMessage pictureEditRequestMessage, WebSocketSession session, User user, Long pictureId) throws IOException {
        //获取正在编辑的用户
        Long editingUserId = pictureEditingUsers.get(pictureId);
        //获取编辑动作
        String editAction = pictureEditRequestMessage.getEditAction();
        PictureEditActionEnum actionEnum = PictureEditActionEnum.getEnumByValue(editAction);
        if(actionEnum == null){
            log.error("未知的编辑动作");
            return;
        }

        //确认当前登录用户是编辑者
        if(editingUserId != null && editingUserId.equals(user.getId())){
            //构造响应 发送具体的操作通知
            PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
            pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.EDIT_ACTION.getValue());
            String message = String.format("用户 %s 执行了 %s", user.getUserName(),actionEnum.getText());
            pictureEditResponseMessage.setMessage(message);
            pictureEditResponseMessage.setEditAction(editAction);
            pictureEditResponseMessage.setUser(userService.getUserVO(user)); //脱敏用户信息再发送
            // 广播给所有用户 除了当前客户端之外的 也就是排除自己
            broadcastToPicture(pictureId, pictureEditResponseMessage,session);
        }


    }

    //退出编辑状态
    public void handlerExitEditMessage(PictureEditRequestMessage pictureEditRequestMessage, WebSocketSession session, User user, Long pictureId) throws IOException {
        //获取正在编辑的用户
        Long editingUserId = pictureEditingUsers.get(pictureId);
        //确认当前登录用户是编辑者
        if(editingUserId != null && editingUserId.equals(user.getId())){
            //移除用户正在编辑该图片
            pictureEditingUsers.remove(pictureId);
        }
        //构造响应 发送退出编辑的通知
        PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
        pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.EXIT_EDIT.getValue());
        String message = String.format("用户 %s 退出编辑图片", user.getUserName());
        pictureEditResponseMessage.setMessage(message);
        pictureEditResponseMessage.setUser(userService.getUserVO(user)); //脱敏用户信息再发送
        // 广播给所有用户
        broadcastToPicture(pictureId, pictureEditResponseMessage);

    }



    //关闭连接后释放资源
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        super.afterConnectionClosed(session, status);
        //从session属性中获得公共参数
        User user = (User) session.getAttributes().get("user");
        Long pictureId = (Long) session.getAttributes().get("pictureId");
        //移除当前用户的编辑状态
        handlerExitEditMessage(null,session,user,pictureId);

        //删除会话
        Set<WebSocketSession> sessionSet = pictureSessions.get(pictureId);
        if(sessionSet != null){
            sessionSet.remove(session);
            if(sessionSet.isEmpty()){
                pictureSessions.remove(pictureId);
            }
        }
        //构造响应 发送已经离开编辑的通知
        PictureEditResponseMessage pictureEditResponseMessage = new PictureEditResponseMessage();
        pictureEditResponseMessage.setType(PictureEditMessageTypeEnum.INFO.getValue());
        String message = String.format("用户 %s 离开编辑", user.getUserName());
        pictureEditResponseMessage.setMessage(message);
        pictureEditResponseMessage.setUser(userService.getUserVO(user)); //脱敏用户信息再发送
        // 广播给所有用户
        broadcastToPicture(pictureId, pictureEditResponseMessage);
    }

    /**
     * 广播给该图片的所有用户 排除掉的session不发送
     * @param pictureId
     * @param pictureEditResponseMessage
     * @param excludeSession 不需要接收该消息的会话
     * @throws IOException
     */
    private void broadcastToPicture(Long pictureId, PictureEditResponseMessage pictureEditResponseMessage,WebSocketSession excludeSession) throws IOException {
        Set<WebSocketSession> sessionSet = pictureSessions.get(pictureId);
        if(CollUtil.isNotEmpty(sessionSet)){

            // 创建 ObjectMapper
            ObjectMapper objectMapper = new ObjectMapper();
            // 配置序列化：将 Long 类型转为 String，解决丢失精度问题
            SimpleModule module = new SimpleModule();
            module.addSerializer(Long.class, ToStringSerializer.instance);
            module.addSerializer(Long.TYPE, ToStringSerializer.instance); // 支持 long 基本类型
            objectMapper.registerModule(module);

            //序列化为json字符串
            String str = objectMapper.writeValueAsString(pictureEditResponseMessage);
            TextMessage textMessage = new TextMessage(str);

            //写入响应内容中
            for (WebSocketSession session : sessionSet) {
                //排除掉的session不发送
                if(excludeSession!=null && session.equals(excludeSession)){
                    continue;
                }
                if(session.isOpen()){
                    session.sendMessage(textMessage);
                }
            }
        }
    }

    /**
     * 广播给该图片的所有用户
     * @param pictureId
     * @param pictureEditResponseMessage
     * @throws IOException
     */
    private void broadcastToPicture(Long pictureId, PictureEditResponseMessage pictureEditResponseMessage) throws IOException {
        broadcastToPicture(pictureId, pictureEditResponseMessage, null);
    }

}
