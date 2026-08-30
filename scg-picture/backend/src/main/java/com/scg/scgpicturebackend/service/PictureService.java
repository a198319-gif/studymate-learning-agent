package com.scg.scgpicturebackend.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.scg.scgpicturebackend.api.aliyunai.model.CreateOutPaintingTaskResponse;
import com.scg.scgpicturebackend.common.DeleteRequest;
import com.scg.scgpicturebackend.model.dto.picture.*;
import com.scg.scgpicturebackend.model.dto.user.UserQueryRequest;
import com.scg.scgpicturebackend.model.entity.Picture;
import com.scg.scgpicturebackend.model.entity.User;
import com.scg.scgpicturebackend.model.vo.PictureVO;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import java.util.List;

/**
* @author 53233
* @description 针对表【picture(图片)】的数据库操作Service
* @createDate 2025-05-04 16:02:03
*/
public interface PictureService extends IService<Picture> {

    /**
     * 上传图片
     * @param inputSource
     * @param pictureUploadRequest
     * @param loginUser
     * @return
     */
    PictureVO uploadPicture(Object inputSource,
                            PictureUploadRequest pictureUploadRequest,
                            User loginUser);

    /**
     * 获取查询条件
     * @return
     */
    QueryWrapper<Picture> getQueryWrapper(PictureQueryRequest pictureQueryRequest);

    //把实体类转换成VO 脱敏用 单条
    PictureVO getPictureVO(Picture picture, HttpServletRequest request);

    /**
     * 把查询到的多条数据 进行脱敏 同时把一些数据和用户进行绑定 给用户使用
     * @param picturePage
     * @param request
     * @return
     */
    Page<PictureVO> getPictureVOPage(Page<Picture> picturePage, HttpServletRequest request);

    //参数校验
    void validPicture(Picture picture);

    /**
     * 图片审核
     * @param pictureReviewRequest
     * @param loginUser
     */
    void doPictureReview(PictureReviewRequest pictureReviewRequest, User loginUser);

    //填充图片审核参数
    public void fillReviewParams(Picture picture, User loginUser);


    /**
     * 批量上传图片
     * @param pictureUploadByBatchRequest
     * @param loginUser
     * @return 抓取成功图片数量
     */
    Integer uploadPictureByBatch(PictureUploadByBatchRequest pictureUploadByBatchRequest,User loginUser);

    void editPicture(PictureEditRequest pictureEditRequest, User loginUser);

    void deletePicture(@RequestBody DeleteRequest deleteRequest, User loginUser);

    //清理图片文件，会删除cos上的内容
    void clearPictureFile(Picture oldPicture);

    /*目前改为satoken统一权限校验 所以不需要调用这个方法校验权限了*/
    //校验空间图片的权限 判断用户是否可见
    void checkPictureAuth(User loginUser, Picture picture);

    //根据颜色查询图片
    List<PictureVO> searchPictureByColor(Long spaceId, String picColor, User loginUser);

    //批量更改图片
    void editPictureByBatch(PictureEditByBatchRequest pictureEditByBatchRequest, User loginUser);

    //创建扩图任务
    CreateOutPaintingTaskResponse createPictureOutPaintingTask(CreatePictureOutPaintingTaskRequest createPictureOutPaintingTaskRequest, User loginUser);
}
