package com.scg.scgpicturebackend.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.scg.scgpicturebackend.api.aliyunai.AliYunAiApi;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskRequest;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskResponse;
import com.scg.scgpicturebackend.api.getpicturebatch.StartGetPictureBatch;
import com.scg.scgpicturebackend.common.DeleteRequest;
import com.scg.scgpicturebackend.constant.UrlConstant;
import com.scg.scgpicturebackend.exception.BusinessException;
import com.scg.scgpicturebackend.exception.ErrorCode;
import com.scg.scgpicturebackend.exception.ThrowUtils;
import com.scg.scgpicturebackend.manager.CosManager;
import com.scg.scgpicturebackend.manager.FileManager;
import com.scg.scgpicturebackend.manager.upload.FilePictureUpload;
import com.scg.scgpicturebackend.manager.upload.PictureUploadTemplate;
import com.scg.scgpicturebackend.manager.upload.UrlPictureUpload;
import com.scg.scgpicturebackend.mapper.PictureMapper;
import com.scg.scgpicturebackend.model.dto.file.UploadPictureResult;
import com.scg.scgpicturebackend.model.dto.picture.*;
import com.scg.scgpicturebackend.model.entity.Picture;
import com.scg.scgpicturebackend.model.entity.Space;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.enums.PictureReviewStatusEnum;
import com.scg.scgpicturebackend.model.vo.PictureVO;
import com.scg.scgpicturebackend.model.vo.UserVO;
import com.scg.scgpicturebackend.service.PictureService;
import com.scg.scgpicturebackend.service.SpaceService;
import com.scg.scgpicturebackend.service.UserService;
import com.scg.scgpicturebackend.utils.ColorSimilarUtils;
import com.scg.scgpicturebackend.utils.ColorTransformUtils;
import com.scg.scgpicturebackend.utils.ExecutorUtils;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.RequestBody;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.awt.*;
import java.io.IOException;
import java.util.*;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
* @author 53233
* @description 针对表【picture(图片)】的数据库操作Service实现
* @createDate 2025-05-04 16:02:03
*/
@Service
@Slf4j
public class PictureServiceImpl extends ServiceImpl<PictureMapper, Picture>
    implements PictureService {

    @Resource
    private FileManager fileManager;

    @Resource
    private UserService userService;

    @Resource
    private FilePictureUpload filePictureUpload;

    @Resource
    private UrlPictureUpload urlPictureUpload;
    @Autowired
    private CosManager cosManager;

    @Resource
    private SpaceService spaceService;

    @Resource
    private TransactionTemplate transactionTemplate;

    @Resource
    private AliYunAiApi aliYunAiApi;

    @Override
    public PictureVO uploadPicture(Object inputSource, PictureUploadRequest pictureUploadRequest, User loginUser) {
        //校验参数
        ThrowUtils.throwIf(loginUser == null, ErrorCode.NO_AUTH_ERROR);

        //校验空间是否存在 上传到私人空间用
        Long spaceId = pictureUploadRequest.getSpaceId();
        if(spaceId != null){
            Space space = spaceService.getById(spaceId);
            ThrowUtils.throwIf(space == null, ErrorCode.NOT_FOUND_ERROR,"Space does not exist");
            /*改为使用统一的 satoken 权限校验*/
            //校验是否有空间的权限 仅空间所有者才能上传
//            if(!loginUser.getId().equals(space.getUserId())){
//                throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
//            }

            /*校验额度*/
            if(space.getTotalCount() >= space.getMaxCount()){
                throw new BusinessException(ErrorCode.PARAMS_ERROR,"Space image count limit exceeded");
            }
            if(space.getTotalSize() >= space.getMaxSize()){
                throw new BusinessException(ErrorCode.PARAMS_ERROR,"Space storage size limit exceeded");
            }
        }

        //判断新增还是更新
        Long pictureId = null;
        if (pictureUploadRequest != null){
            pictureId = pictureUploadRequest.getId();
        }

        // 更新之前先查询老的图片信息 用作后续去cos删除图片用 因为更新后数据库url变了 无法溯源cos数据
        Picture oldPicture = null;

        //如果是更新 还要判断图片是否存在 以及判断审核状态
        if(pictureId != null){
            oldPicture = this.getById(pictureId);
            ThrowUtils.throwIf(oldPicture == null, ErrorCode.NOT_FOUND_ERROR,"Picture does not exist");

            /*改为使用统一的satoken权限校验*/
            //校验是否有空间的权限 仅空间所有者才能上传
//            if(!loginUser.getId().equals(space.getUserId())){
//                throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
//            }

            //校验空间是否一致
            //没传spaceid则复用原有的图片的spaceid 这样也兼容了公共图库
            if(spaceId == null){
                if(oldPicture.getSpaceId() !=null){
                    spaceId = oldPicture.getSpaceId();
                }
            }else{
                //传了 spaceid，必须和原图片空间 id 一致
                if(ObjUtil.notEqual(spaceId,oldPicture.getSpaceId())){
                    throw new BusinessException(ErrorCode.PARAMS_ERROR,"Space ID mismatch");
                }
            }
        }

        //上传图片 得到图片信息
        /*按照用户 id 划分目录 => 按照空间划分目录*/
        String uploadPathPrefix;
        if(spaceId == null){
            //公共图库
            uploadPathPrefix = String.format("public/%s", loginUser.getId());
        }else{
            //私有空间
            uploadPathPrefix = String.format("space/%s", spaceId);
        }

        //todo 根据inputSource的类型，区分上传方式
        PictureUploadTemplate pictureUploadTemplate = filePictureUpload;

        /*如果传入的inputSource是String类型，说明是通过url上传 那么只要修改实现即可*/
        if(inputSource instanceof String){
            pictureUploadTemplate = urlPictureUpload;
        }

        /*上传图片到cos 并获取图片信息*/
        UploadPictureResult uploadPictureResult = pictureUploadTemplate.uploadPicture(inputSource, uploadPathPrefix);

        //构造要入库的图片信息8
        Picture picture = new Picture();
        picture.setSpaceId(spaceId); //指定空间id
        picture.setUrl(uploadPictureResult.getUrl());
        picture.setThumbnailUrl(uploadPictureResult.getThumbnailUrl()); //缩略图地址

        //修改图片名命名规则 如果是普通的单图片上传 直接用原始的图片名 如果是批量上传 那么会给request设置图片名，那么就用我们自定义的图片名入库
        String picName = uploadPictureResult.getPicName();
        if(pictureUploadRequest!=null && StrUtil.isNotBlank(pictureUploadRequest.getPicName())){
            picName = pictureUploadRequest.getPicName();
        }
        picture.setName(picName);

        picture.setPicSize(uploadPictureResult.getPicSize());
        picture.setPicWidth(uploadPictureResult.getPicWidth());
        picture.setPicHeight(uploadPictureResult.getPicHeight());
        picture.setPicScale(uploadPictureResult.getPicScale());
        picture.setPicFormat(uploadPictureResult.getPicFormat());
        //picture.setPicColor(uploadPictureResult.getPicColor()); //获取图片主色调
        picture.setPicColor(ColorTransformUtils.getStandardColor(uploadPictureResult.getPicColor())); //获取图片主色调
        picture.setUserId(loginUser.getId());
        /*补充审核参数*/
        this.fillReviewParams(picture, loginUser);

        //操作数据库
        /*判断是更新还是新增*/
        if(pictureId !=null){
            //如果是更新 需要补充id和编辑时间
            picture.setId(pictureId);
            picture.setEditTime(new Date());
        }



        /*更新空间的使用额度 涉及两个表 使用事务*/
        //开启事务
        Long finalSpaceId = spaceId;
        transactionTemplate.execute(status ->{
            //保存到数据库 saveorupdate 就是有就更新没有就插入
            boolean result = this.saveOrUpdate(picture);
            ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR,"Failed to upload picture");
        
            //更新空间使用额度 如果是公共空间 不应该更新空间额度
            if(finalSpaceId != null){
                boolean update = spaceService.lambdaUpdate()
                        .eq(Space::getId, finalSpaceId)
                        .setSql("totalSize = totalSize + " + picture.getPicSize())
                        .setSql("totalCount = totalCount + 1")
                        .update();
                ThrowUtils.throwIf(!update, ErrorCode.OPERATION_ERROR,"Failed to update space quota");
            }
            //这个随便执行都行
            return true;
        });

        //TODO 如果是更新 删除图片资源
        //清理图片资源 cos
        if(oldPicture != null){
            this.clearPictureFile(oldPicture);
        }
        //转换成vo类 返回 脱敏
        return PictureVO.objToVo(picture);
    }

    @Override
    public PictureVO getPictureVO(Picture picture, HttpServletRequest request) {
        // 对象转封装类
        PictureVO pictureVO = PictureVO.objToVo(picture);
        // 关联查询用户信息
        Long userId = picture.getUserId();
        if (userId != null && userId > 0) {
            User user = userService.getById(userId);
            UserVO userVO = userService.getUserVO(user);
            pictureVO.setUser(userVO);
        }
        return pictureVO;
    }

    /**
     * 分页获取图片封装
     */
    @Override
    public Page<PictureVO> getPictureVOPage(Page<Picture> picturePage, HttpServletRequest request) {
        List<Picture> pictureList = picturePage.getRecords();
        Page<PictureVO> pictureVOPage = new Page<>(picturePage.getCurrent(), picturePage.getSize(), picturePage.getTotal());
        if (CollUtil.isEmpty(pictureList)) {
            return pictureVOPage;
        }
        // 对象列表 => 封装对象列表
        List<PictureVO> pictureVOList = pictureList.stream()
                .map(PictureVO::objToVo)
                .collect(Collectors.toList());
        /*关联查询用户信息 根据分页查询到的图片信息中的userid 去数据库查询出这些user的详细信息*/
        Set<Long> userIdSet = pictureList.stream().map(Picture::getUserId).collect(Collectors.toSet());
        // 1 => user1, 2 => user2 转换成map kv的形式
        Map<Long, List<User>> userIdUserListMap = userService.listByIds(userIdSet).stream()
                .collect(Collectors.groupingBy(User::getId));
        // 2. 填充信息
        /*关联完整的图片信息和用户信息 然后返回给pictureVOPage*/
        pictureVOList.forEach(pictureVO -> {
            Long userId = pictureVO.getUserId();
            User user = null;
            if (userIdUserListMap.containsKey(userId)) {
                user = userIdUserListMap.get(userId).get(0);
            }
            pictureVO.setUser(userService.getUserVO(user));
        });
        //重新填充进分页的数据中
        pictureVOPage.setRecords(pictureVOList);
        return pictureVOPage;
    }

    @Override
    public QueryWrapper<Picture> getQueryWrapper(PictureQueryRequest pictureQueryRequest) {
        if(pictureQueryRequest == null){
            throw new BusinessException(ErrorCode.PARAMS_ERROR,"Invalid request parameters");
        }

        QueryWrapper<Picture> queryWrapper = new QueryWrapper<>();

        //封装图片的查询体
        // 从对象中取值
        Long id = pictureQueryRequest.getId();
        String name = pictureQueryRequest.getName();
        String introduction = pictureQueryRequest.getIntroduction();
        String category = pictureQueryRequest.getCategory();
        List<String> tags = pictureQueryRequest.getTags();
        Long picSize = pictureQueryRequest.getPicSize();
        Integer picWidth = pictureQueryRequest.getPicWidth();
        Integer picHeight = pictureQueryRequest.getPicHeight();
        Double picScale = pictureQueryRequest.getPicScale();
        String picFormat = pictureQueryRequest.getPicFormat();
        String searchText = pictureQueryRequest.getSearchText();
        Long userId = pictureQueryRequest.getUserId();
        String sortField = pictureQueryRequest.getSortField();
        String sortOrder = pictureQueryRequest.getSortOrder();

        //查询时间体哦阿健
        Date startEditTime = pictureQueryRequest.getStartEditTime();
        Date endEditTime = pictureQueryRequest.getEndEditTime();

        /*空间id*/
        Long spaceId = pictureQueryRequest.getSpaceId();
        boolean nullSpaceId = pictureQueryRequest.isNullSpaceId();

        /*审核参数*/
        Integer reviewStatus = pictureQueryRequest.getReviewStatus();
        String reviewMessage = pictureQueryRequest.getReviewMessage();
        Long reviewerId = pictureQueryRequest.getReviewerId();


        // 从多字段中搜索
        if (StrUtil.isNotBlank(searchText)) {
            // 需要拼接查询条件
            // and (name like "%xxx%" or introduction like "%xxx%")
            queryWrapper.and(
                    qw -> qw.like("name", searchText)
                            .or()
                            .like("introduction", searchText)
            );
        }
        queryWrapper.eq(ObjUtil.isNotEmpty(id), "id", id);
        queryWrapper.eq(ObjUtil.isNotEmpty(userId), "userId", userId);
        queryWrapper.eq(ObjUtil.isNotEmpty(spaceId), "spaceId", spaceId); //空间id
        queryWrapper.isNull(nullSpaceId,"spaceId"); //是否公共空间
        queryWrapper.like(StrUtil.isNotBlank(name), "name", name);
        queryWrapper.like(StrUtil.isNotBlank(introduction), "introduction", introduction);
        queryWrapper.like(StrUtil.isNotBlank(picFormat), "picFormat", picFormat);
        queryWrapper.like(StrUtil.isNotBlank(reviewMessage), "reviewMessage", reviewMessage);
        queryWrapper.eq(StrUtil.isNotBlank(category), "category", category);
        queryWrapper.eq(ObjUtil.isNotEmpty(picWidth), "picWidth", picWidth);
        queryWrapper.eq(ObjUtil.isNotEmpty(picHeight), "picHeight", picHeight);
        queryWrapper.eq(ObjUtil.isNotEmpty(picSize), "picSize", picSize);
        queryWrapper.eq(ObjUtil.isNotEmpty(picScale), "picScale", picScale);
        queryWrapper.eq(ObjUtil.isNotEmpty(reviewStatus), "reviewStatus", reviewStatus);
        queryWrapper.eq(ObjUtil.isNotEmpty(reviewerId), "reviewerId", reviewerId);
        //日期范围查询
        queryWrapper.ge(ObjUtil.isNotEmpty(startEditTime), "editTime", startEditTime);
        queryWrapper.lt(ObjUtil.isNotEmpty(endEditTime), "editTime", endEditTime);


        // JSON 数组查询
        if (CollUtil.isNotEmpty(tags)) {
            /* and (tag like "%\"Java\"%" and like "%\"Python\"%") */
            for (String tag : tags) {
                queryWrapper.like("tags", "\"" + tag + "\"");
            }
        }
        // 排序
        queryWrapper.orderBy(StrUtil.isNotEmpty(sortField), sortOrder.equals("ascend"), sortField);
        return queryWrapper;

    }

    @Override
    public void validPicture(Picture picture) {
        ThrowUtils.throwIf(picture == null, ErrorCode.PARAMS_ERROR);
        // 从对象中取值
        Long id = picture.getId();
        String url = picture.getUrl();
        String introduction = picture.getIntroduction();
        // 修改数据时，id 不能为空，有参数则校验
        ThrowUtils.throwIf(ObjUtil.isNull(id), ErrorCode.PARAMS_ERROR, "ID cannot be empty");
        // 如果传递了 url，才校验
        if (StrUtil.isNotBlank(url)) {
            ThrowUtils.throwIf(url.length() > 1024, ErrorCode.PARAMS_ERROR, "URL is too long");
        }
        if (StrUtil.isNotBlank(introduction)) {
            ThrowUtils.throwIf(introduction.length() > 800, ErrorCode.PARAMS_ERROR, "Introduction is too long");
        }
    }

    @Override
    public void doPictureReview(PictureReviewRequest pictureReviewRequest, User loginUser) {
        //1.校验参数
        ThrowUtils.throwIf(pictureReviewRequest == null, ErrorCode.PARAMS_ERROR);
        Long id = pictureReviewRequest.getId();
        Integer reviewStatus = pictureReviewRequest.getReviewStatus();
        PictureReviewStatusEnum reviewStatusEnum = PictureReviewStatusEnum.getEnumByValue(reviewStatus);
        String reviewMessage = pictureReviewRequest.getReviewMessage();

        // 判断id 审核状态参数
        if(id == null || reviewStatusEnum == null || PictureReviewStatusEnum.REVIEWING.equals(reviewStatusEnum)){
             throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }

        //2.判断图片是否存在
        Picture oldPicture = this.getById(id);
        ThrowUtils.throwIf(oldPicture == null, ErrorCode.NOT_FOUND_ERROR);

        //3。判断审核状态是否存在
        if(oldPicture.getReviewStatus().equals(reviewStatus)){
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "Please do not review repeatedly");
        }

        //4.操作数据库 更新
        Picture updatePicture = new Picture();
        BeanUtil.copyProperties(pictureReviewRequest, updatePicture);
        updatePicture.setReviewerId(loginUser.getId());
        updatePicture.setReviewTime(new Date());
        boolean result = this.updateById(updatePicture);

        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
    }

    @Override
    public void fillReviewParams(Picture picture, User loginUser){
        if(userService.isAdmin(loginUser)){
            //管理员自动过审 管理员上传图片的时候直接过审
            picture.setReviewStatus(PictureReviewStatusEnum.PASS.getValue());
            picture.setReviewerId(loginUser.getId());
            picture.setReviewMessage("Administrator operation, auto-approved");
            picture.setReviewTime(new Date());
        }else{
            //非管理员 啥操作都要待审核
            picture.setReviewStatus(PictureReviewStatusEnum.REVIEWING.getValue());
        }
    }

    //todo 这个解析逻辑是基于bing图片的 也许其他网址的html命名啥的都不一样 如果想改的话可能需要增改下处理逻辑
    @Override
    public Integer uploadPictureByBatch(PictureUploadByBatchRequest pictureUploadByBatchRequest, User loginUser) {
        //校验参数
        String searchText = pictureUploadByBatchRequest.getSearchText();
        Integer count = pictureUploadByBatchRequest.getCount();
        //默认名称前缀等于搜索词
        String namePrefix = pictureUploadByBatchRequest.getNamePrefix();
        if(StrUtil.isBlank(namePrefix)){
            namePrefix = searchText;
        }

        ThrowUtils.throwIf(count > 30, ErrorCode.PARAMS_ERROR, "Maximum 30 images can be grabbed at once");
        /*        抓取内容 这里使用bing图片的接口路径 然后q=%s动态拼接条件 当然也可以使用+号拼接字符串
        如果要换其他接口 可能查询内容会加密 也许会有%s冲突*/
        Elements imgElementList = StartGetPictureBatch.getPicturebatch(UrlConstant.BING_PICTURE_URL, searchText);
        //打印获取的url
        imgElementList.stream().forEach(imgElement -> System.out.println(StartGetPictureBatch.processPictureUrl(imgElement)));

        /*2025/5/16 使用Future改进批量上传图片接口 使用异步多线程*/
        //IO密集型任务 涉及文件上传cos 按理来说核心线程数应该是2n+1 但是这里根据图片数量并且考虑到网络影响 所以动态分配
        ExecutorService pictureUploadExecutor = ExecutorUtils.createDynamicUploadExecutor(count,"upload-picture",ExecutorUtils.IO_TASK);

        //用于整理结果 想阻塞等待的话就放开这行
        //List<CompletableFuture<Boolean>> futures = new ArrayList<>();

        //多线程任务 使用原子类的integer确保数量正确 用于多线程中图片编号
        AtomicInteger uploadCount = new AtomicInteger(0);
        //用于控制循环次数
        int submittedCount = 0;
        for(Element imgElement : imgElementList){
            if(submittedCount >=count){
                break;
            }
             /*处理图片url 每个网址的可能都不一样所以需要处理*/
            String fileUrl = StartGetPictureBatch.processPictureUrl(imgElement);
            if (fileUrl == null) continue;

            submittedCount++;
            //使用comFuture异步执行任务
            String finalNamePrefix = namePrefix; //因为在多线程中有改窜的风险 所以要重新赋值一次
            //runAsync方法没有返回值 supplyAsync要返回值
            CompletableFuture.runAsync(() ->{
                try {
                    PictureUploadRequest pictureUploadRequest = new PictureUploadRequest();
                    pictureUploadRequest.setFileUrl(fileUrl);
                    pictureUploadRequest.setPicName(finalNamePrefix + (uploadCount.get() + 1));

                    PictureVO pictureVO = this.uploadPicture(fileUrl, pictureUploadRequest, loginUser);
                    log.info("上传图片成功：{}", pictureVO.getId());
                    uploadCount.incrementAndGet();  // 成功了才自增
                }catch (Exception e){
                    log.error("上传图片失败：{}",e);
                }
            },pictureUploadExecutor); //把任务提交给指定线程池
            //futures.add(future);
        }
        return 1;

        //阻塞等待结果全部完成
//        try {
//            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0]))
//                    .get(5, TimeUnit.MINUTES);
//
//            //关闭线程池
//            pictureUploadExecutor.shutdown();
//
//            long end = System.currentTimeMillis();
//            System.out.println("花费时间：" + (end - start));
//            return uploadCount.get();
//
//        } catch (Exception e) {
//            throw new BusinessException(ErrorCode.OPERATION_ERROR,"Task timeout");
//        }
    }

    @Override
    public void editPicture(PictureEditRequest pictureEditRequest, User loginUser){
        // 将实体类和 DTO 前台的请求类 进行转换
        Picture picture = new Picture();
        BeanUtils.copyProperties(pictureEditRequest, picture);
        /*注意将 list 转为 string*/
        picture.setTags(JSONUtil.toJsonStr(pictureEditRequest.getTags()));

        //设置编辑时间
        picture.setEditTime(new Date());

        // 数据校验
        validPicture(picture);


        /*补充审核参数*/
        fillReviewParams(picture, loginUser);

        // 判断是否存在
        long id = pictureEditRequest.getId();
        /*查询图片从数据库*/
        Picture oldPicture = this.getById(id);

        ThrowUtils.throwIf(oldPicture == null, ErrorCode.NOT_FOUND_ERROR);

        /*目前改为satoken统一权限校验 所以不需要调用这个方法校验权限了*/
        //仅本人和管理员可以编辑 校验权限
        //checkPictureAuth(loginUser, oldPicture);

        // 操作数据库
        boolean result = this.updateById(picture);
        ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);
    }

    @Override
    public void deletePicture(@RequestBody DeleteRequest deleteRequest, User loginUser){
        if (deleteRequest == null || deleteRequest.getId() <= 0) {
            throw new BusinessException(ErrorCode.PARAMS_ERROR);
        }
        Long id = deleteRequest.getId();

        //判断是否存在
        Picture oldPicture = this.getById(id);
        ThrowUtils.throwIf(oldPicture == null, ErrorCode.NOT_FOUND_ERROR);

        /*目前改为satoken统一权限校验 所以不需要调用这个方法校验权限了*/
        //仅本人或管理员可删除 校验权限
        //checkPictureAuth(loginUser, oldPicture);

        /*更新空间的使用额度 涉及两个表 使用事务*/
        //开启事务
        transactionTemplate.execute(status ->{
            //操作数据库
            boolean result = this.removeById(id);
            ThrowUtils.throwIf(!result, ErrorCode.OPERATION_ERROR);

            //更新空间使用额度 释放
            if(ObjUtil.isNotEmpty(oldPicture.getSpaceId())){
                boolean update = spaceService.lambdaUpdate()
                        .eq(Space::getId, oldPicture.getSpaceId())
                        .setSql("totalSize = totalSize - " + oldPicture.getPicSize())
                        .setSql("totalCount = totalCount - 1")
                        .update();
                ThrowUtils.throwIf(!update, ErrorCode.OPERATION_ERROR,"Failed to update space quota");
            }
            //这个随便返回啥都行
            return true;
        });

        //清理图片资源 cos
        this.clearPictureFile(oldPicture);
    }

    //异步执行，删除操作异步执行 先返回前端信息 要用这个功能 要改main启动类加注解
    // 这个注解会开启一个线程执行任务 他默认使用的线程池为SimpleAsyncTaskExecutor
    @Async
    @Override
    public void clearPictureFile(Picture oldPicture) {
        //判断该图片是否被多条记录使用
        String pictureUrl = oldPicture.getUrl();
        long count = this.lambdaQuery()
                .eq(Picture::getUrl, pictureUrl)
                .count();

        //有不止一条记录用到了该图片 不清理
        if(count > 1){
            return;
        }

        /*需要处理获取的url 因为腾讯云cos删除传的是bucket和图片路径 图片路径不用拼接bucket
        * 这里数据库存的带bucket*/
        int seperateIndex = pictureUrl.indexOf(".com");
        String seperatedUrl = pictureUrl.substring(seperateIndex+4, pictureUrl.length());
            //删除图片
            cosManager.deleteObject(seperatedUrl);
            //删除缩略图
            String thumbnailUrl = oldPicture.getThumbnailUrl();
            if(StrUtil.isNotBlank(thumbnailUrl)){
                seperateIndex = thumbnailUrl.indexOf(".com");
                seperatedUrl = thumbnailUrl.substring(seperateIndex+4, thumbnailUrl.length());

                cosManager.deleteObject(seperatedUrl);
            }
    }

    @Override
    public void checkPictureAuth(User loginUser, Picture picture) {
        Long spaceId = picture.getSpaceId();
        Long loginUserId = loginUser.getId();
        if(spaceId == null){
            //公共图库，仅本人或管理员可操作
            if(!picture.getUserId().equals(loginUserId) && !userService.isAdmin(loginUser)){
                throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
            }
        }else{
            //私有空间，仅空间管理员 （所有者）可以操作
            if(!picture.getUserId().equals(loginUserId)){
                throw new BusinessException(ErrorCode.NO_AUTH_ERROR);
            }
        }
    }

    @Override
    public List<PictureVO> searchPictureByColor(Long spaceId, String picColor, User loginUser) {
        //1.校验参数
        ThrowUtils.throwIf(spaceId==null || StrUtil.isBlank(picColor),ErrorCode.PARAMS_ERROR);
        ThrowUtils.throwIf(loginUser==null,ErrorCode.NOT_LOGIN_ERROR);
        //2.校验空间权限
        Space space = spaceService.getById(spaceId);
        ThrowUtils.throwIf(space==null,ErrorCode.NOT_FOUND_ERROR,"Space does not exist");
        if(!space.getUserId().equals(loginUser.getId())){
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR,"No space permission");
        }
        //3.查询该空间下的所有图片 必须要有主色调
        List<Picture> pictureList = this.lambdaQuery()
                .eq(Picture::getSpaceId, spaceId)
                .isNotNull(Picture::getPicColor)
                .list();

        //如果没有图片 直接返回空列表
        if(CollUtil.isEmpty(pictureList)){
            return new ArrayList<>();
        }

        //把颜色字符串转换为主色调
        Color targetColor = Color.decode(picColor);

        //4.计算相似度然后排序
        List<Picture> sortedPictureList = pictureList.stream()
                .sorted(Comparator.comparingDouble(picture -> {
                    String hexColor = picture.getPicColor();
                    //没有主色调的图片会默认排序到最后
                    if (StrUtil.isBlank(hexColor)) {
                        return Double.MAX_VALUE;
                    }
                    //拿到数据库中的主色调
                    Color pictureColor = Color.decode(hexColor);
                    //计算相似度 越大越相似
                    return -ColorSimilarUtils.calculateSimilarity(targetColor, pictureColor);
                }))
                .limit(12) //只取前12个
                .collect(Collectors.toList());

        //5.返回 map是映射 调用objTOVO把值转换一下
        return sortedPictureList.stream().map(PictureVO::objToVo).collect(Collectors.toList());
    }

    @Override
    public void editPictureByBatch(PictureEditByBatchRequest pictureEditByBatchRequest, User loginUser) {
        //获取和校验参数
        List<Long> pictureIdList = pictureEditByBatchRequest.getPictureIdList();
        Long spaceId = pictureEditByBatchRequest.getSpaceId();
        String category = pictureEditByBatchRequest.getCategory();
        List<String> tags = pictureEditByBatchRequest.getTags();
        ThrowUtils.throwIf(CollUtil.isEmpty(pictureIdList),ErrorCode.PARAMS_ERROR,"Please select pictures");
        ThrowUtils.throwIf(spaceId==null,ErrorCode.PARAMS_ERROR,"Please select a space");
        ThrowUtils.throwIf(loginUser == null,ErrorCode.NO_AUTH_ERROR);

        //校验空间权限
        Space space = spaceService.getById(spaceId);
        ThrowUtils.throwIf(space == null,ErrorCode.NOT_FOUND_ERROR,"Space does not exist");
        if(!space.getUserId().equals(loginUser.getId())){
            throw new BusinessException(ErrorCode.NO_AUTH_ERROR,"No space permission");
        }

        //查询指定图片，仅选择需要的字段进行查询
        List<Picture> pictureList = this.lambdaQuery()
                .select(Picture::getId, Picture::getSpaceId)
                .eq(Picture::getSpaceId, spaceId)
                .in(Picture::getId, pictureIdList)
                .list();
        if(pictureList.isEmpty()){
            return;
        }

        //更新分类和标签
        pictureList.forEach(picture -> {
            if (StrUtil.isNotBlank(category)) {
                picture.setCategory(category);
            }
            if (CollUtil.isNotEmpty(tags)) {
                picture.setTags(JSONUtil.toJsonStr(tags));
            }
        });

        //批量重命名
        String nameRule = pictureEditByBatchRequest.getNameRule(); //命名规则
        fillPictureWithNameRule(pictureList,nameRule);

        //批量更新数据库
        boolean result = this.updateBatchById(pictureList);
        ThrowUtils.throwIf(!result,ErrorCode.OPERATION_ERROR,"Batch edit failed");
    }

    @Override
    public CreateOutPaintingTaskResponse createPictureOutPaintingTask(CreatePictureOutPaintingTaskRequest createPictureOutPaintingTaskRequest, User loginUser) {
        //获取图片信息
        Long pictureId = createPictureOutPaintingTaskRequest.getPictureId();
        Picture picture = Optional.ofNullable(this.getById(pictureId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_ERROR,"Picture does not exist"));

        /*目前改为satoken统一权限校验 所以不需要调用这个方法校验权限了*/
        //校验权限
        //checkPictureAuth(loginUser,picture);
        //创建扩图任务
        CreateOutPaintingTaskRequest createOutPaintingTaskRequest = new CreateOutPaintingTaskRequest();
        CreateOutPaintingTaskRequest.Input input = new CreateOutPaintingTaskRequest.Input();
        input.setImageUrl(picture.getUrl());
        createOutPaintingTaskRequest.setInput(input);
        createOutPaintingTaskRequest.setParameters(createPictureOutPaintingTaskRequest.getParameters());

        // 创建任务
        return aliYunAiApi.createOutPaintingTask(createOutPaintingTaskRequest);

    }

    //namerule 格式： 图片{序号}
    private void fillPictureWithNameRule(List<Picture> pictureList, String nameRule) {
        if(StrUtil.isBlank(nameRule) || CollUtil.isEmpty(pictureList)){
            return;
        }
        long count = 1;

        try {
            for(Picture picture : pictureList){
                String pictureName = nameRule.replaceAll("\\{序号}",String.valueOf(count++));
                picture.setName(pictureName);
            }
        } catch (Exception e) {
            log.error("Batch rename failed",e);
            throw new BusinessException(ErrorCode.OPERATION_ERROR,"Name parsing error");
        }
    }
}




