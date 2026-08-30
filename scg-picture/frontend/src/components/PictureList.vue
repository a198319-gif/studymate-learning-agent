<template>
  <div class="picture-list">
    <!-- 图片列表 -->
    <a-list
      :grid="{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 5 }"
      :data-source="dataList"
      :loading="loading"
    >
      <template #renderItem="{ item: picture }">
        <a-list-item class="picture-list-item">
          <!-- 单张图片 -->
          <a-card
            class="picture-card"
            hoverable
            role="link"
            tabindex="0"
            :aria-label="`Open ${picture.name ?? 'image'}`"
            @click="doClickPicture(picture)"
            @keydown.enter="doClickPicture(picture)"
            @keydown.space.prevent="doClickPicture(picture)"
          >
            <template #cover>
              <div class="picture-cover">
                <img
                  :alt="picture.name"
                  :src="picture.thumbnailUrl ?? picture.url"
                />
                <div class="picture-overlay">
                  <div class="picture-name">{{ picture.name }}</div>
                  <div class="picture-meta">
                    <a-tag>{{ picture.category ?? 'Default' }}</a-tag>
                    <span v-for="tag in picture.tags" :key="tag">#{{ tag }}</span>
                  </div>
                </div>
              </div>
            </template>
            <template v-if="showOp" #actions>
              <ShareAltOutlined @click="(e) => doShare(picture, e)" />
              <SearchOutlined @click="(e) => doSearch(picture, e)" />
              <EditOutlined v-if="canEdit" @click="(e) => doEdit(picture, e)" />
              <DeleteOutlined v-if="canDelete" @click="(e) => doDelete(picture, e)" />
            </template>
          </a-card>
        </a-list-item>
      </template>
    </a-list>
    <ShareModal ref="shareModalRef" title="Share Image" :link="shareLink" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  DeleteOutlined,
  EditOutlined,
  SearchOutlined,
  ShareAltOutlined,
} from '@ant-design/icons-vue'
import { deletePictureUsingPost } from '@/api/pictureController.ts'
import { message } from 'ant-design-vue'
import ShareModal from '@/components/ShareModal.vue'
import { ref } from 'vue'

interface Props {
  dataList?: API.PictureVO[]
  loading?: boolean
  showOp?: boolean
  canEdit?: boolean
  canDelete?: boolean
  onReload?: () => void
}

const props = withDefaults(defineProps<Props>(), {
  dataList: () => [],
  loading: false,
  showOp: false,
  canEdit: false,
  canDelete: false,
})

const router = useRouter()
// 跳转至图片详情页
const doClickPicture = (picture: API.PictureVO) => {
  router.push({
    path: `/picture/${picture.id}`,
  })
}

// 搜索
const doSearch = (picture: API.PictureVO, e: MouseEvent) => {
  // 阻止冒泡
  e.stopPropagation()
  // 打开新的页面
  window.open(`/search_picture?pictureId=${picture.id}`)
}

// 编辑
const doEdit = (picture: API.PictureVO, e: MouseEvent) => {
  // 阻止冒泡
  e.stopPropagation()
  // 跳转时一定要携带 spaceId
  router.push({
    path: '/add_picture',
    query: {
      id: picture.id,
      spaceId: picture.spaceId,
    },
  })
}

// 删除数据
const doDelete = async (picture: API.PictureVO, e: MouseEvent) => {
  // 阻止冒泡
  e.stopPropagation()
  const id = picture.id
  if (!id) {
    return
  }
  const res = await deletePictureUsingPost({ id })
  if (res.data.code === 0) {
    message.success('Deleted successfully')
    props.onReload?.()
  } else {
    message.error('Deletion failed')
  }
}

// ----- 分享操作 ----
const shareModalRef = ref()
// 分享链接
const shareLink = ref<string>('')
// 分享
const doShare = (picture: API.PictureVO, e: MouseEvent) => {
  // 阻止冒泡
  e.stopPropagation()
  shareLink.value = `${window.location.protocol}//${window.location.host}/picture/${picture.id}`
  if (shareModalRef.value) {
    shareModalRef.value.openModal()
  }
}
</script>

<style scoped>
.picture-list :deep(.ant-list-items) {
  align-items: stretch;
}

.picture-list-item {
  height: 100%;
  padding: 0 !important;
}

.picture-card {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a1a2f;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 5, 18, 0.18);
}

.picture-card:hover {
  border-color: rgba(94, 234, 212, 0.5);
  box-shadow: 0 18px 40px rgba(0, 8, 24, 0.4);
  transform: translateY(-3px);
}

.picture-card:focus-visible {
  border-color: var(--scg-accent);
  box-shadow: 0 0 0 3px rgba(34, 211, 197, 0.2), 0 18px 40px rgba(0, 8, 24, 0.4);
  outline: none;
  transform: translateY(-3px);
}

.picture-card :deep(.ant-card-body:empty) {
  display: none;
}

.picture-card :deep(.ant-card-actions) {
  margin: 0;
  background: #0b1d33;
  border-top-color: var(--scg-border);
}

.picture-card :deep(.ant-card-actions > li) {
  margin-block: 10px;
}

.picture-cover {
  position: relative;
  min-height: 220px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #10243c;
}

.picture-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 320ms ease;
}

.picture-card:hover .picture-cover img {
  transform: scale(1.035);
}

.picture-overlay {
  position: absolute;
  inset: auto 0 0;
  padding: 10px 12px;
  color: #f6fbff;
  background: rgba(3, 10, 22, 0.76);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
}

.picture-name {
  overflow: hidden;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picture-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  overflow: hidden;
  color: #a7bdd3;
  font-size: 11px;
  white-space: normal;
}

.picture-meta :deep(.ant-tag) {
  margin: 0;
  padding-inline: 6px;
  color: #6ee7db;
  font-size: 10px;
  line-height: 18px;
  background: rgba(34, 211, 197, 0.12);
  border-color: rgba(94, 234, 212, 0.2);
}

@media (max-width: 576px) {
  .picture-cover {
    min-height: 250px;
  }
}
</style>
