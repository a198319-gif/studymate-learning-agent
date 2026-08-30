package com.scg.scgpicturebackend.manager.auth;

import cn.hutool.core.io.resource.ResourceUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.scg.scgpicturebackend.manager.auth.model.SpaceUserAuthConfig;
import com.scg.scgpicturebackend.manager.auth.model.SpaceUserPermissionConstant;
import com.scg.scgpicturebackend.manager.auth.model.SpaceUserRole;
import com.scg.scgpicturebackend.model.entity.Space;
import com.scg.scgpicturebackend.model.entity.SpaceUser;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.enums.SpaceRoleEnum;
import com.scg.scgpicturebackend.model.enums.SpaceTypeEnum;
import com.scg.scgpicturebackend.service.SpaceUserService;
import com.scg.scgpicturebackend.service.UserService;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

//空间成员权限管理 通用的 用于编程式的权限管理
@Component
public class SpaceUserAuthManager {
    @Resource
    private UserService userService;

    @Resource
    private SpaceUserService spaceUserService;

    public static final SpaceUserAuthConfig SPACE_USER_AUTH_CONFIG;

    //当类加载的时候 读取配置文件数据到类中
    static{
        //使用hutool工具包 先读取配置文件为json数据 然后在把json数据转换成实体类对象
        String json = ResourceUtil.readUtf8Str("biz/spaceUserAuthConfig.json");
        SPACE_USER_AUTH_CONFIG = JSONUtil.toBean(json, SpaceUserAuthConfig.class);
    }

    //根据角色职责获取权限列表
    public List<String> getPermissionsByRole(String spaceUserRole){
        if(StrUtil.isBlank(spaceUserRole)){
            return new ArrayList<>();
        }

        //根据传入的角色职责，获取指定的权限列表 比如 传入的职责是editor 这里就会过滤只获取editor的职责列表
        SpaceUserRole role = SPACE_USER_AUTH_CONFIG.getRoles().stream()
                .filter(r -> r.getKey().equals(spaceUserRole))
                .findFirst()
                .orElse(null);

        if(role == null){
            return new ArrayList<>();
        }
        //返回权限列表
        return role.getPermissions();
    }

    /**
     * 获取权限列表
     *
     * @param space
     * @param loginUser
     * @return
     */
    public List<String> getPermissionList(Space space, User loginUser) {
        if (loginUser == null) {
            return new ArrayList<>();
        }
        // 管理员权限
        List<String> ADMIN_PERMISSIONS = getPermissionsByRole(SpaceRoleEnum.ADMIN.getValue());
        // 公共图库
        if (space == null) {
            if (userService.isAdmin(loginUser)) {
                return ADMIN_PERMISSIONS;
            }
            return Collections.singletonList(SpaceUserPermissionConstant.PICTURE_VIEW);
        }
        SpaceTypeEnum spaceTypeEnum = SpaceTypeEnum.getEnumByValue(space.getSpaceType());
        if (spaceTypeEnum == null) {
            return new ArrayList<>();
        }
        // 根据空间获取对应的权限
        switch (spaceTypeEnum) {
            case PRIVATE:
                // 私有空间，仅本人或管理员有所有权限
                if (space.getUserId().equals(loginUser.getId()) || userService.isAdmin(loginUser)) {
                    return ADMIN_PERMISSIONS;
                } else {
                    return new ArrayList<>();
                }
            case TEAM:
                // 团队空间，查询 SpaceUser 并获取角色和权限
                SpaceUser spaceUser = spaceUserService.lambdaQuery()
                        .eq(SpaceUser::getSpaceId, space.getId())
                        .eq(SpaceUser::getUserId, loginUser.getId())
                        .one();
                if (spaceUser == null) {
                    return new ArrayList<>();
                } else {
                    return getPermissionsByRole(spaceUser.getSpaceRole());
                }
        }
        return new ArrayList<>();
    }

}
