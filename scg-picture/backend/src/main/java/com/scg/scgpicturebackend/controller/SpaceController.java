package com.scg.scgpicturebackend.controller;

import cn.hutool.core.util.RandomUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.scg.scgpicturebackend.annotation.AuthCheck;
import com.scg.scgpicturebackend.common.BaseResponse;
import com.scg.scgpicturebackend.common.DeleteRequest;
import com.scg.scgpicturebackend.common.ResultUtils;
import com.scg.scgpicturebackend.constant.UserConstant;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import com.scg.scgpicturebackend.manager.auth.SpaceUserAuthManager;
import com.scg.scgpicturebackend.model.dto.picture.*;
import com.scg.scgpicturebackend.model.dto.space.*;
import com.scg.scgpicturebackend.model.entity.Picture;
import com.scg.scgpicturebackend.model.entity.Space;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.enums.PictureReviewStatusEnum;
import com.scg.scgpicturebackend.model.enums.SpaceLevelEnum;
import com.scg.scgpicturebackend.model.vo.PictureTagCategory;
import com.scg.scgpicturebackend.model.vo.PictureVO;
import com.scg.scgpicturebackend.model.vo.SpaceVO;
import com.scg.scgpicturebackend.service.PictureService;
import com.scg.scgpicturebackend.service.SpaceService;
import com.scg.scgpicturebackend.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.util.DigestUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/space")
@Slf4j
public class SpaceController {

    @Resource
    private UserService userService;

    @Resource
    private SpaceService spaceService;

    @Resource
    private SpaceUserAuthManager spaceUserAuthManager;

    //创建空间
    @PostMapping("/add")
    public BaseResponse<Long> addSpace(@RequestBody SpaceAddRequest spaceAddRequest, HttpServletRequest request) {
        ThrowUtils.throwIf(spaceAddRequest == null, ErrorCode.PARAMS_ERROR);
        User loginUser = userService.getLoginUser(request);
        long id = spaceService.addSpace(spaceAddRequest, loginUser);
        return ResultUtils.success(id);
    }


    @PostMapping("/delete")
    public BaseResponse<Boolean> deleteSpace(@RequestBody DeleteRequest deleteRequest,HttpServletRequest request){
        if (deleteRequest == null || deleteRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        User loginUser = userService.getLoginUser(request);
        Long id = deleteRequest.getId();

        //判断是否存在
        Space oldSpace = spaceService.getById(id);
        ThrowUtils.throwIf(oldSpace == null, ErrorCode.NOT_FOUND_ERROR);

        //仅本人或管理员可删除
        spaceService.checkSpaceAuth(loginUser, oldSpace);
        //操作数据库
        boolean result = spaceService.removeById(id);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);

        return ResultUtils.success(true);
    }

    /**
     * 更新空间（仅管理员可用）
     *
     * @param spaceUpdateRequest
     * @return
     */
    @PostMapping("/update")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Boolean> updateSpace(@RequestBody SpaceUpdateRequest spaceUpdateRequest, HttpServletRequest request) {
        if (spaceUpdateRequest == null || spaceUpdateRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        // 将实体类和 DTO 进行转换
        Space space = new Space();
        BeanUtils.copyProperties(spaceUpdateRequest, space);
        // 数据校验
        spaceService.validSpace(space,false);

        //填充空间大小和容量
        spaceService.fillSpaceBySpaceLevel(space);

        // 判断是否存在
        long id = spaceUpdateRequest.getId();
        Space oldSpace = spaceService.getById(id);
        ThrowUtils.throwIf(oldSpace == null, ErrorCode.NOT_FOUND_ERROR);
        // 操作数据库
        boolean result = spaceService.updateById(space);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return ResultUtils.success(true);
    }

    /**
     * 根据 id 获取空间（仅管理员可用）
     */
    @GetMapping("/get")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Space> getSpaceById(long id, HttpServletRequest request) {
        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);

        Space space = spaceService.getById(id);

        ThrowUtils.throwIf(space == null, ErrorCode.NOT_FOUND_ERROR);

        return ResultUtils.success(space);

    }

    /**
     * 根据 id 获取空间（封装类） 脱敏 用户可用
     */
    @GetMapping("/get/vo")
    public BaseResponse<SpaceVO> getSpaceVOById(long id, HttpServletRequest request) {

        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);

        Space space = spaceService.getById(id);

        ThrowUtils.throwIf(space == null, ErrorCode.NOT_FOUND_ERROR);

        SpaceVO spaceVO = spaceService.getSpaceVO(space, request);

        /*设置权限列表*/
        User loginUser = userService.getLoginUser(request);
        List<String> permissionList = spaceUserAuthManager.getPermissionList(space, loginUser);
        spaceVO.setPermissionList(permissionList);

        return ResultUtils.success(spaceVO);
    }

    /**
     * 分页获取空间列表（仅管理员可用） 空间管理功能用
     */
    @PostMapping("/list/page")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Page<Space>> listSpaceByPage(@RequestBody SpaceQueryRequest spaceQueryRequest) {
        int current = spaceQueryRequest.getCurrent();
        int size = spaceQueryRequest.getPageSize();

        //构建查询体
        QueryWrapper<Space> queryWrapper = spaceService.getQueryWrapper(spaceQueryRequest);

        //执行分页查询
        Page<Space> spacePage = spaceService.page(new Page<>(current, size), queryWrapper);

        return ResultUtils.success(spacePage);

    }

    /**
     * 分页获取空间列表（封装类）脱敏 首页展示用
     * 查询出来的条数和上面的方法一样 但是上面的不会脱敏 因为需要进行管理
     */
    @PostMapping("/list/page/vo")
    public BaseResponse<Page<SpaceVO>> listSpaceVOByPage(@RequestBody SpaceQueryRequest spaceQueryRequest,
                                                             HttpServletRequest request) {

        int current = spaceQueryRequest.getCurrent();
        int size = spaceQueryRequest.getPageSize();

        //不允许用户一次查询超过20防止爬虫
        ThrowUtils.throwIf(size > 20 , ErrorCode.PARAMS_ERROR);

        //构建查询体 就是拼接sql在里面
        QueryWrapper<Space> queryWrapper = spaceService.getQueryWrapper(spaceQueryRequest);

        //执行分页查询
        Page<Space> page = spaceService.page(new Page<>(current, size), queryWrapper);

        /*把数据脱敏 然后这个方法里还会关联查询到的空间和这个空间对应的脱敏后的用户信息*/
        Page<SpaceVO> spaceVOPage = spaceService.getSpaceVOPage(page, request);

        return ResultUtils.success(spaceVOPage);
    }

    /**
     * 编辑空间（给用户使用）
     */
    /*这个方法也会在上传空间后点击创建调用 用来补全上传空间后的描述信息*/
    @PostMapping("/edit")
    public BaseResponse<Boolean> editSpace(@RequestBody SpaceEditRequest spaceEditRequest, HttpServletRequest request) {
        if (spaceEditRequest == null || spaceEditRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        // 将实体类和 DTO 前台的请求类 进行转换
        Space space = new Space();
        BeanUtils.copyProperties(spaceEditRequest, space);

        //设置编辑时间
        space.setEditTime(new Date());

        // 数据校验
        spaceService.validSpace(space,false);

        //填充空间大小和容量
        spaceService.fillSpaceBySpaceLevel(space);

        User loginUser = userService.getLoginUser(request);

        // 判断是否存在
        long id = spaceEditRequest.getId();
        /*查询空间从数据库*/
        Space oldSpace = spaceService.getById(id);

        ThrowUtils.throwIf(oldSpace == null, ErrorCode.NOT_FOUND_ERROR);

        //仅本人和管理员可以编辑
        spaceService.checkSpaceAuth(loginUser, oldSpace);


        // 操作数据库
        boolean result = spaceService.updateById(space);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return ResultUtils.success(true);
    }

    //获取所有的空间对应的信息
   @GetMapping("/list/level")
    public BaseResponse<List<SpaceLevel>> listSpaceLavel(){
       List<SpaceLevel> spaceLevelList = Arrays.stream(SpaceLevelEnum.values())
               //map作用是把值映射给另一个值
               .map(spaceLevelEnum -> new SpaceLevel(
                           spaceLevelEnum.getValue(),
                           spaceLevelEnum.getText(),
                           spaceLevelEnum.getMaxCount(),
                           spaceLevelEnum.getMaxSize()
                   )).collect(Collectors.toList());//把结果封装成list

       return ResultUtils.success(spaceLevelList);
   }
}


