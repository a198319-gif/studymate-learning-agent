package com.scg.scgpicturebackend.controller;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.RandomUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.LoadingCache;
import com.qcloud.cos.model.COSObject;
import com.qcloud.cos.model.COSObjectInputStream;
import com.qcloud.cos.utils.IOUtils;
import com.scg.scgpicturebackend.annotation.AuthCheck;
import com.scg.scgpicturebackend.api.aliyunai.AliYunAiApi;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskResponse;
import com.scg.scgpicturebackend.api.aliyunai.model.GetOutPaintingTaskResponse;
import com.scg.scgpicturebackend.api.imagesearch.ImageSearchApiFacade;
import com.scg.scgpicturebackend.api.imagesearch.model.ImageSearchResult;
import com.scg.scgpicturebackend.common.BaseResponse;
import com.scg.scgpicturebackend.common.DeleteRequest;
import com.scg.scgpicturebackend.common.ResultUtils;
import com.scg.scgpicturebackend.constant.UserConstant;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import com.scg.scgpicturebackend.manager.CosManager;
import com.scg.scgpicturebackend.manager.auth.SpaceUserAuthManager;
import com.scg.scgpicturebackend.manager.auth.StpKit;
import com.scg.scgpicturebackend.manager.auth.annotation.SaSpaceCheckPermission;
import com.scg.scgpicturebackend.manager.auth.model.SpaceUserPermissionConstant;
import com.scg.scgpicturebackend.model.dto.picture.*;
import com.scg.scgpicturebackend.model.entity.Picture;
import com.scg.scgpicturebackend.model.entity.Space;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.enums.PictureReviewStatusEnum;
import com.scg.scgpicturebackend.model.vo.PictureTagCategory;
import com.scg.scgpicturebackend.model.vo.PictureVO;
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
import javax.servlet.http.HttpServletResponse;
import java.io.File;
import java.time.Duration;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Random;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/picture")
@Slf4j
public class PictureController {

    @Resource
    private UserService userService;

    @Resource
    private PictureService pictureService;

    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Resource
    private SpaceService spaceService;

    @Resource
    private AliYunAiApi aliYunAiApi;


    @Resource
    private SpaceUserAuthManager spaceUserAuthManager;

    /*本地缓存*/
    private final Cache<String, String> LOCAL_CACHE = Caffeine.newBuilder()
            .initialCapacity(1024) //初始容量
            .maximumSize(10_000L) // 最大 10000 条
            // 缓存 5 分钟后移除
            .expireAfterWrite(Duration.ofMinutes(5))
            .build();

    //上传图片 可以重新上传
    /*这个接口是选择完图片就会进行调用 然后上传到服务器把图片信息和谁上传的入库
    * 之后点击创建按钮调用的其实是edit 用来补全描述信息*/
    @PostMapping("/upload")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_UPLOAD) //使用satoken做权限校验
    //@AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<PictureVO> uploadPicture(
            @RequestPart("file") MultipartFile multipartFile,
            PictureUploadRequest pictureUploadRequest,
            HttpServletRequest request){

        User loginUser = userService.getLoginUser(request);
        PictureVO pictureVO = pictureService.uploadPicture(multipartFile, pictureUploadRequest, loginUser);

        return ResultUtils.success(pictureVO);

    }

    //使用url地址上传图片
    @PostMapping("/upload/url")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_UPLOAD) //使用satoken做权限校验
    public BaseResponse<PictureVO> uploadPictureByUrl(
            @RequestBody PictureUploadRequest pictureUploadRequest,
            HttpServletRequest request){

        User loginUser = userService.getLoginUser(request);
        PictureVO pictureVO = pictureService.uploadPicture(pictureUploadRequest.getFileUrl(), pictureUploadRequest, loginUser);

        return ResultUtils.success(pictureVO);

    }

    @PostMapping("/delete")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_DELETE) //使用satoken做权限校验
    public BaseResponse<Boolean> deletePicture(@RequestBody DeleteRequest deleteRequest,HttpServletRequest request){
        if (deleteRequest == null || deleteRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        User loginUser = userService.getLoginUser(request);
        pictureService.deletePicture(deleteRequest, loginUser);

        return ResultUtils.success(true);
    }

    /**
     * 更新图片（仅管理员可用）
     *
     * @param pictureUpdateRequest
     * @return
     */
    /*这个目前没用到 管理员用的也是editPicture 考虑废除*/
    @PostMapping("/update")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Boolean> updatePicture(@RequestBody PictureUpdateRequest pictureUpdateRequest,HttpServletRequest request) {
        if (pictureUpdateRequest == null || pictureUpdateRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        // 将实体类和 DTO 进行转换
        Picture picture = new Picture();
        BeanUtils.copyProperties(pictureUpdateRequest, picture);
        /*注意将 list 转为 string*/
        picture.setTags(JSONUtil.toJsonStr(pictureUpdateRequest.getTags()));
        // 数据校验
        pictureService.validPicture(picture);
        // 判断是否存在
        long id = pictureUpdateRequest.getId();
        Picture oldPicture = pictureService.getById(id);
        ThrowUtils.throwIf(oldPicture == null, ErrorCode.NOT_FOUND_ERROR);

        /*补充审核参数*/
        pictureService.fillReviewParams(oldPicture, userService.getLoginUser(request));

        // 操作数据库
        boolean result = pictureService.updateById(picture);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
        return ResultUtils.success(true);
    }

    /**
     * 根据 id 获取图片（仅管理员可用）
     */
    @GetMapping("/get")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Picture> getPictureById(long id, HttpServletRequest request) {
        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);

        Picture picture = pictureService.getById(id);

        ThrowUtils.throwIf(picture == null, ErrorCode.NOT_FOUND_ERROR);

        return ResultUtils.success(picture);

    }

    /**
     * 根据 id 获取图片（封装类） 脱敏 用户可用
     */
    @GetMapping("/get/vo")
    public BaseResponse<PictureVO> getPictureVOById(long id, HttpServletRequest request) {

        ThrowUtils.throwIf(id <= 0, ErrorCode.PARAMS_ERROR);

        Picture picture = pictureService.getById(id);

        ThrowUtils.throwIf(picture == null, ErrorCode.NOT_FOUND_ERROR);

        //空间权限校验 如果空间id有值 说明不是公共空间 如果不是看看是不是自己的
        Long spaceId = picture.getSpaceId();
        Space space = null;
        if(spaceId != null){
            /*使用鉴权式注解 因为这个方法未登录也可以访问*/
            boolean hasPermission = StpKit.SPACE.hasPermission(SpaceUserPermissionConstant.PICTURE_VIEW);
            ThrowUtils.throwIf(!hasPermission, ErrorCode.NO_AUTH_ERROR);

            /*目前改为satoken统一权限校验 所以不需要调用这个方法校验权限了*/
            //User loginUser = userService.getLoginUser(request);
            //pictureService.checkPictureAuth(loginUser, picture);


            space = spaceService.getById(spaceId);
            ThrowUtils.throwIf(space == null, ErrorCode.NOT_FOUND_ERROR,"Space does not exist");
        }

        /*设置权限列表*/
        User loginUser = userService.getLoginUser(request);
        List<String> permissionList = spaceUserAuthManager.getPermissionList(space, loginUser);
        PictureVO pictureVO = pictureService.getPictureVO(picture, request);
        pictureVO.setPermissionList(permissionList);

        return ResultUtils.success(pictureVO);
    }

    /**
     * 分页获取图片列表（仅管理员可用） 图片管理功能用
     */
    @PostMapping("/list/page")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Page<Picture>> listPictureByPage(@RequestBody PictureQueryRequest pictureQueryRequest) {
        int current = pictureQueryRequest.getCurrent();
        int size = pictureQueryRequest.getPageSize();

        //构建查询体
        QueryWrapper<Picture> queryWrapper = pictureService.getQueryWrapper(pictureQueryRequest);

        //执行分页查询
        Page<Picture> picturePage = pictureService.page(new Page<>(current, size), queryWrapper);

        return ResultUtils.success(picturePage);

    }

    /**
     * 分页获取图片列表（封装类）脱敏 首页展示用
     * 查询出来的条数和上面的方法一样 但是上面的不会脱敏 因为需要进行管理
     */
    @PostMapping("/list/page/vo")
    public BaseResponse<Page<PictureVO>> listPictureVOByPage(@RequestBody PictureQueryRequest pictureQueryRequest,
                                                             HttpServletRequest request) {

        int current = pictureQueryRequest.getCurrent();
        int size = pictureQueryRequest.getPageSize();

        //不允许用户一次查询超过20防止爬虫
        ThrowUtils.throwIf(size > 20 , ErrorCode.PARAMS_ERROR);

        /*空间权限校验*/
        Long spaceId = pictureQueryRequest.getSpaceId();

        //如果空间id为null 说明查询的是公共图片那么就额外设置查询条件 查看审核通过的数据以及空间id为null的数据
        if(spaceId == null){
            pictureQueryRequest.setReviewStatus(PictureReviewStatusEnum.PASS.getValue());
            pictureQueryRequest.setNullSpaceId(true);
        }else{

            /*使用鉴权式注解 因为这个方法未登录也可以访问*/
            boolean hasPermission = StpKit.SPACE.hasPermission(SpaceUserPermissionConstant.PICTURE_VIEW);
            ThrowUtils.throwIf(!hasPermission, ErrorCode.NO_AUTH_ERROR);

            //私有空间 校验权限 如果空间id有值 说明不是公共空间 如果不是看看是不是自己的
//            User loginUser = userService.getLoginUser(request);
//            Space space = spaceService.getById(spaceId);
//            ThrowUtils.throwIf(space == null, ErrorCode.NOT_FOUND_ERROR,"空间不存在");
//
//            if(!loginUser.getId().equals(space.getUserId())){
//                throw new BusinessException(ErrorCode.NO_AUTH_ERROR,"No space permission");
//            }
        }

        //构建查询体 就是拼接sql在里面
        QueryWrapper<Picture> queryWrapper = pictureService.getQueryWrapper(pictureQueryRequest);

        //执行分页查询
        Page<Picture> page = pictureService.page(new Page<>(current, size), queryWrapper);

        /*把数据脱敏 然后这个方法里还会关联查询到的图片和这个图片对应的脱敏后的用户信息*/
        Page<PictureVO> pictureVOPage = pictureService.getPictureVOPage(page, request);

        return ResultUtils.success(pictureVOPage);
    }

    /**
     * 分页获取图片列表（封装类）脱敏 首页展示用
     * 查询出来的条数和上面的方法一样 但是上面的不会脱敏 因为需要进行管理
     */
    //todo 带缓存版本(redis/本地缓存)的首页查询 目前没有开放 只做学习用 使用的还是非缓存方式查询
    @Deprecated
    @PostMapping("/list/page/vo/cache")
    public BaseResponse<Page<PictureVO>> listPictureVOByPageWithCache(@RequestBody PictureQueryRequest pictureQueryRequest,
                                                             HttpServletRequest request) {

        int current = pictureQueryRequest.getCurrent();
        int size = pictureQueryRequest.getPageSize();

        //不允许用户一次查询超过20防止爬虫
        ThrowUtils.throwIf(size > 20 , ErrorCode.PARAMS_ERROR);

        /*前台的首页只能查询到审核通过的数据*/
        pictureQueryRequest.setReviewStatus(PictureReviewStatusEnum.PASS.getValue());

        //查询缓存，没有再去数据库
        //构建缓存，转成md5
        String queryCondition = JSONUtil.toJsonStr(pictureQueryRequest);
        String hashKey = DigestUtils.md5DigestAsHex(queryCondition.getBytes());
        String cachKey = String.format("scgpicture:listPictureVOByPage:%s", hashKey);

        /*1. 先操作本地缓存查询*/
        String cachedValue = LOCAL_CACHE.getIfPresent(cachKey);
        if(cachedValue != null){
            //缓存命中，反序列化返回
            Page<PictureVO> cachedPage = JSONUtil.toBean(cachedValue, Page.class);
            return ResultUtils.success(cachedPage);
        }

        /*2. 本地缓存未命中，操作redis缓存查询*/
        cachedValue = stringRedisTemplate.opsForValue().get(cachKey);
        if(cachedValue != null){
            //缓存命中，更新本地缓存 反序列化返回
            LOCAL_CACHE.put(cachKey, cachedValue);
            Page<PictureVO> cachedPage = JSONUtil.toBean(cachedValue, Page.class);

            return ResultUtils.success(cachedPage);
        }

        //构建查询体 就是拼接sql在里面
        QueryWrapper<Picture> queryWrapper = pictureService.getQueryWrapper(pictureQueryRequest);

        //执行分页查询
        Page<Picture> page = pictureService.page(new Page<>(current, size), queryWrapper);

        /*把数据脱敏 然后这个方法里还会关联查询到的图片和这个图片对应的脱敏后的用户信息*/
        Page<PictureVO> pictureVOPage = pictureService.getPictureVOPage(page, request);

        /*3. 存入redis缓存 设置随机过期时间 避免同时过期导致雪崩*/
        String cacheValue = JSONUtil.toJsonStr(pictureVOPage);
        int cacheExpireTIme = 300 + RandomUtil.randomInt(0,300);
        stringRedisTemplate.opsForValue().set(cachKey, cacheValue, cacheExpireTIme, TimeUnit.SECONDS);
        /*4. 存入本地缓存*/
        LOCAL_CACHE.put(cachKey, cacheValue);

        return ResultUtils.success(pictureVOPage);
    }

    /**
     * 编辑图片（给用户使用）
     */
    /*这个方法也会在上传图片后点击创建调用 用来补全上传图片后的描述信息*/
    @PostMapping("/edit")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_EDIT) //使用satoken做权限校验
    public BaseResponse<Boolean> editPicture(@RequestBody PictureEditRequest pictureEditRequest, HttpServletRequest request) {
        if (pictureEditRequest == null || pictureEditRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        User loginUser = userService.getLoginUser(request);
        pictureService.editPicture(pictureEditRequest, loginUser);

        return ResultUtils.success(true);
    }

    @GetMapping("/tag_category")
    public BaseResponse<PictureTagCategory> listPictureTagCategory() {
        PictureTagCategory pictureTagCategory = new PictureTagCategory();
        /*写死了 后面要用数据库存储动态获取*/
        List<String> tagList = Arrays.asList("Hot", "Anime", "Life", "HD", "Art", "Campus", "Background", "Resume", "Creative");
        List<String> categoryList = Arrays.asList("Wallpaper", "E-commerce", "Emoticon", "Material", "Poster");
        pictureTagCategory.setTagList(tagList);
        pictureTagCategory.setCategoryList(categoryList);
        return ResultUtils.success(pictureTagCategory);
    }

    //审核图片 仅管理员
    @PostMapping("/review")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Boolean> doPictureReview(@RequestBody PictureReviewRequest pictureReviewRequest,HttpServletRequest request) {

        ThrowUtils.throwIf(pictureReviewRequest == null, ErrorCode.PARAMS_ERROR);
        pictureService.doPictureReview(pictureReviewRequest, userService.getLoginUser(request));

        return ResultUtils.success(true);
    }

    //批量抓取并创建图片 仅管理员
    @PostMapping("/upload/batch")
    @AuthCheck(mustRole = UserConstant.ADMIN_ROLE)
    public BaseResponse<Integer> uploadPictureByBatch(@RequestBody PictureUploadByBatchRequest pictureUploadByBatchRequest,
                                                      HttpServletRequest request) {

        ThrowUtils.throwIf(pictureUploadByBatchRequest == null, ErrorCode.PARAMS_ERROR);
        int uploadCount = pictureService.uploadPictureByBatch(pictureUploadByBatchRequest, userService.getLoginUser(request));

        return ResultUtils.success(uploadCount);
    }

    //以图搜图
    @PostMapping("/search/picture")
    public BaseResponse<List<ImageSearchResult>> searchPictureByPicture(@RequestBody SearchPictureByPictureRequest searchPictureByPictureRequest) {

        /*步骤： 前端传图片id 从数据库拿到图片url 然后调用我们的getImageApi*/
        ThrowUtils.throwIf(searchPictureByPictureRequest == null, ErrorCode.PARAMS_ERROR);

        Long pictureId = searchPictureByPictureRequest.getPictureId();
        ThrowUtils.throwIf(pictureId == null, ErrorCode.PARAMS_ERROR);

        Picture picture = pictureService.getById(pictureId);
        ThrowUtils.throwIf(picture == null, ErrorCode.NOT_FOUND_ERROR);

        List<ImageSearchResult> resultList = ImageSearchApiFacade.searchImage(picture.getThumbnailUrl());
        return ResultUtils.success(resultList);
    }

    //按照颜色搜索
    @PostMapping("/search/color")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_VIEW) //使用satoken做权限校验
    public BaseResponse<List<PictureVO>> searchPictureByColor(@RequestBody SearchPictureByColorRequest searchPictureByColorRequest,HttpServletRequest request) {

        ThrowUtils.throwIf(searchPictureByColorRequest == null, ErrorCode.PARAMS_ERROR);
        String picColor = searchPictureByColorRequest.getPicColor();
        Long spaceId = searchPictureByColorRequest.getSpaceId();
        User loginUser = userService.getLoginUser(request);
        List<PictureVO> pictureVOList = pictureService.searchPictureByColor(spaceId, picColor, loginUser);

        return ResultUtils.success(pictureVOList);
    }

    //批量编辑
    @PostMapping("/edit/batch")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_EDIT) //使用satoken做权限校验
    public BaseResponse<Boolean> editPictureByBatch(@RequestBody PictureEditByBatchRequest pictureEditByBatchRequest,HttpServletRequest request) {

        ThrowUtils.throwIf(pictureEditByBatchRequest == null, ErrorCode.PARAMS_ERROR);
        User loginUser = userService.getLoginUser(request);
        pictureService.editPictureByBatch(pictureEditByBatchRequest, loginUser);

        return ResultUtils.success(true);
    }

    //创建AI扩图任务
    @PostMapping("/out_painting/create_task")
    @SaSpaceCheckPermission(value = SpaceUserPermissionConstant.PICTURE_EDIT) //使用satoken做权限校验
    public BaseResponse<CreateOutPaintingTaskResponse> createPictureOutPaintingTask(@RequestBody CreatePictureOutPaintingTaskRequest createPictureOutPaintingTaskRequest,
                                                                                    HttpServletRequest request) {
        if (createPictureOutPaintingTaskRequest == null || createPictureOutPaintingTaskRequest.getPictureId() == null) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        User loginUser = userService.getLoginUser(request);
        CreateOutPaintingTaskResponse response = pictureService.createPictureOutPaintingTask(createPictureOutPaintingTaskRequest, loginUser);
        return ResultUtils.success(response);
    }

    /**
     * 查询 AI 扩图任务
     */
    @GetMapping("/out_painting/get_task")
    public BaseResponse<GetOutPaintingTaskResponse> getPictureOutPaintingTask(String taskId) {
        ThrowUtils.throwIf(StrUtil.isBlank(taskId), ErrorCode.PARAMS_ERROR);
        GetOutPaintingTaskResponse task = aliYunAiApi.getOutPaintingTask(taskId);
        return ResultUtils.success(task);
    }

    /**
     * AI text-to-image
     */
    @PostMapping("/ai/generate_picture")
    public BaseResponse<String> generatePicture(@RequestBody GeneratePictureRequest request) {
        ThrowUtils.throwIf(request == null || StrUtil.isBlank(request.getPrompt()), ErrorCode.PARAMS_ERROR, "Prompt cannot be empty");
        String imageUrl = aliYunAiApi.generatePicture(request.getPrompt());
        return ResultUtils.success(imageUrl);
    }
}

