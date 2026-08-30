package com.scg.scgpicturebackend.manager.websocket;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.scg.scgpicturebackend.manager.auth.SpaceUserAuthManager;
import com.scg.scgpicturebackend.manager.auth.model.SpaceUserPermissionConstant;
import com.scg.scgpicturebackend.model.entity.Picture;
import com.scg.scgpicturebackend.model.entity.Space;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.enums.SpaceTypeEnum;
import com.scg.scgpicturebackend.service.PictureService;
import com.scg.scgpicturebackend.service.SpaceService;
import com.scg.scgpicturebackend.service.SpaceUserService;
import com.scg.scgpicturebackend.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
//websocket拦截器，建立连接前要先校验
@Slf4j
@Component //要引入其他bean 这个类也要注册到spring容器中
public class WsHandshakeInterceptor implements HandshakeInterceptor {

    @Resource
    private UserService userService;
    @Resource
    private PictureService pictureService;
    @Resource
    private SpaceService spaceService;
    @Resource
    private SpaceUserService spaceUserService;
    @Resource
    private SpaceUserAuthManager spaceUserAuthManager;

    /**
     * 建立连接前先校验
     * @param request
     * @param response
     * @param wsHandler
     * @param attributes 给websocketsession会话设置属性
     * @return
     * @throws Exception
     */
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        //校验逻辑 获取当前登录用户
        if(request instanceof ServletServerHttpRequest){
            HttpServletRequest httpServletRequest = ((ServletServerHttpRequest) request).getServletRequest();
            //从请求中获取参数
            String pictureId = httpServletRequest.getParameter("pictureId");
            if(StrUtil.isBlank(pictureId)){
                log.error("缺少图片参数，拒绝握手");
                return false;
            }
            //获取当前用户
            User loginUser = userService.getLoginUser(httpServletRequest);
            if(ObjUtil.isEmpty(loginUser)){
                log.error("用户未登录，拒绝握手");
                return false;
            }

            //校验用户是否有编辑当前图片的权限
            Picture picture = pictureService.getById(pictureId);
            if(ObjUtil.isEmpty(picture)){
                log.error("图片不存在，拒绝握手");
                return false;
            }

            //校验空间
            Long spaceId = picture.getSpaceId();
            Space space = null;
            if(spaceId != null){
                space = spaceService.getById(spaceId);
                if(ObjUtil.isEmpty(space)){
                    log.error("空间不存在，拒绝握手");
                    return false;
                }
                //判断是否是团队空间
                 if(space.getSpaceType() != SpaceTypeEnum.TEAM.getValue()){
                     log.error("图片所在空间不是团队空间，拒绝握手");
                     return false;
                 }
            }
            //鉴权 这个做扩展用 实际上目前逻辑要不要这段都无所谓
            List<String> permissionList = spaceUserAuthManager.getPermissionList(space, loginUser);
            if(!permissionList.contains(SpaceUserPermissionConstant.PICTURE_EDIT)){
                log.error("用户没有编辑图片的权限，拒绝握手");
                return false;
            }

            //设置用户登录信息等属性到websocket会话中
            attributes.put("user",loginUser);
            attributes.put("userId",loginUser.getId());
            attributes.put("pictureId",Long.valueOf(pictureId)); //记得转换为long类型
        }

        //如果是团队空间，并且有编辑者权限，才能建立连接
        return true;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {

    }
}
