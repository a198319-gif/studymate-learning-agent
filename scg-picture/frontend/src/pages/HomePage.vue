<template>
  <div id="homePage">
    <section class="filter-panel" aria-label="Gallery filters">
      <div class="filter-topline">
        <!-- 搜索框 -->
        <div class="search-bar">
          <a-input-search
            v-model:value="searchParams.searchText"
            placeholder="Search images..."
            enter-button="Search"
            size="large"
            @search="doSearch"
          />
        </div>
        <!-- 分类筛选 -->
        <a-tabs
          v-model:active-key="selectedCategory"
          class="category-tabs"
          @change="doSearch"
        >
          <a-tab-pane key="all" tab="All" />
          <a-tab-pane v-for="category in categoryList" :tab="category" :key="category" />
        </a-tabs>
      </div>
      <div class="tag-bar">
        <span class="filter-label">Tags</span>
        <a-space :size="[8, 8]" wrap>
          <a-checkable-tag
            v-for="(tag, index) in tagList"
            :key="tag"
            v-model:checked="selectedTagList[index]"
            @change="doSearch"
          >
            # {{ tag }}
          </a-checkable-tag>
        </a-space>
      </div>
    </section>
    <div class="gallery-area">
      <!-- 图片列表 -->
      <PictureList :dataList="dataList" :loading="loading" />
      <!-- 分页 -->
      <a-pagination
        v-model:current="searchParams.current"
        v-model:pageSize="searchParams.pageSize"
        :total="total"
        @change="onPageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  listPictureTagCategoryUsingGet,
  listPictureVoByPageUsingPost,
} from '@/api/pictureController.ts'
import { message } from 'ant-design-vue'
import PictureList from '@/components/PictureList.vue' // 定义数据

// 定义数据
const dataList = ref<API.PictureVO[]>([])
const total = ref(0)
const loading = ref(true)

// 搜索条件
const searchParams = reactive<API.PictureQueryRequest>({
  current: 1,
  pageSize: 12,
  sortField: 'createTime',
  sortOrder: 'descend',
})

// 获取数据
const fetchData = async () => {
  loading.value = true
  // 转换搜索参数
  const params = {
    ...searchParams,
    tags: [] as string[],
  }
  if (selectedCategory.value !== 'all') {
    params.category = selectedCategory.value
  }
  // [true, false, false] => ['java']
  selectedTagList.value.forEach((useTag, index) => {
    if (useTag) {
      params.tags.push(tagList.value[index])
    }
  })
  const res = await listPictureVoByPageUsingPost(params)
  if (res.data.code === 0 && res.data.data) {
    dataList.value = res.data.data.records ?? []
    total.value = res.data.data.total ?? 0
  } else {
    message.error('faild，' + res.data.message)
  }
  loading.value = false
}

// 页面加载时获取数据，请求一次
onMounted(() => {
  fetchData()
})

// 分页参数
const onPageChange = (page: number, pageSize: number) => {
  searchParams.current = page
  searchParams.pageSize = pageSize
  fetchData()
}

// 搜索
const doSearch = () => {
  // 重置搜索条件
  searchParams.current = 1
  fetchData()
}

// 标签和分类列表
const categoryList = ref<string[]>([])
const selectedCategory = ref<string>('all')
const tagList = ref<string[]>([])
const selectedTagList = ref<boolean[]>([])

/**
 * 获取标签和分类选项
 * @param values
 */
const getTagCategoryOptions = async () => {
  const res = await listPictureTagCategoryUsingGet()
  if (res.data.code === 0 && res.data.data) {
    tagList.value = res.data.data.tagList ?? []
    categoryList.value = res.data.data.categoryList ?? []
  } else {
    message.error('faild，' + res.data.message)
  }
}

onMounted(() => {
  getTagCategoryOptions()
})
</script>

<style scoped>
#homePage {
  width: 100%;
  padding-bottom: 18px;
}

#homePage .filter-panel {
  overflow: hidden;
  margin-bottom: 22px;
  background: rgba(11, 29, 51, 0.82);
  border: 1px solid var(--scg-border);
  border-radius: 14px;
  box-shadow: var(--scg-shadow);
  backdrop-filter: blur(16px);
}

#homePage .filter-topline {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.6fr);
  align-items: center;
  gap: 28px;
  min-height: 66px;
  padding: 10px;
  border-bottom: 1px solid var(--scg-border);
}

#homePage .search-bar {
  width: 100%;
}

#homePage .search-bar :deep(.ant-input-group-addon .ant-btn) {
  min-width: 84px;
}

#homePage .category-tabs {
  min-width: 0;
}

#homePage .category-tabs :deep(.ant-tabs-nav) {
  margin: 0;
}

#homePage .category-tabs :deep(.ant-tabs-nav::before),
#homePage .category-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}

#homePage .category-tabs :deep(.ant-tabs-tab) {
  margin: 0 8px 0 0;
  padding: 8px 16px;
  color: #9eb1c8;
  background: rgba(16, 36, 60, 0.65);
  border: 1px solid var(--scg-border);
  border-radius: 9px;
}

#homePage .category-tabs :deep(.ant-tabs-tab:hover),
#homePage .category-tabs :deep(.ant-tabs-tab-active) {
  color: #dffdfa;
  background: var(--scg-accent-soft);
  border-color: var(--scg-accent);
}

#homePage .category-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: #5eead4;
}

#homePage .tag-bar {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
}

#homePage .filter-label {
  padding-top: 5px;
  color: #6f879f;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

#homePage .tag-bar :deep(.ant-tag-checkable) {
  margin-inline-end: 0;
  padding: 4px 12px;
  color: #9db2c9;
  background: rgba(21, 44, 70, 0.9);
  border: 1px solid transparent;
  border-radius: 7px;
}

#homePage .tag-bar :deep(.ant-tag-checkable:hover),
#homePage .tag-bar :deep(.ant-tag-checkable-checked) {
  color: #5eead4;
  background: rgba(34, 211, 197, 0.12);
  border-color: rgba(94, 234, 212, 0.24);
}

#homePage .gallery-area {
  min-height: 400px;
}

@media (max-width: 960px) {
  #homePage .filter-topline {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}

@media (max-width: 640px) {
  #homePage .filter-panel {
    margin-bottom: 16px;
    border-radius: 12px;
  }

  #homePage .filter-topline {
    padding: 10px;
  }

  #homePage .tag-bar {
    display: block;
  }

  #homePage .filter-label {
    display: block;
    margin-bottom: 8px;
  }
}
</style>
