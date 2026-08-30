<template>
  <div id="addPictureBatchPage">
    <h2 style="margin-bottom: 16px">Batch Create</h2>
    <!-- Image information form -->
    <a-form name="formData" layout="vertical" :model="formData" @finish="handleSubmit">
      <a-form-item name="searchText" label="Keyword">
        <a-input v-model:value="formData.searchText" placeholder="Enter keyword" allow-clear />
      </a-form-item>
      <a-form-item name="count" label="Capture Count">
        <a-input-number
          v-model:value="formData.count"
          placeholder="Enter count"
          style="min-width: 180px"
          :min="1"
          :max="30"
          allow-clear
        />
      </a-form-item>
      <a-form-item name="namePrefix" label="Name Prefix">
        <a-input
          v-model:value="formData.namePrefix"
          placeholder="Enter name prefix, auto-fill sequence number"
          allow-clear
        />
      </a-form-item>
      <a-form-item>
        <a-button type="primary" html-type="submit" style="width: 100%" :loading="loading">
          Execute Task
        </a-button>
      </a-form-item>
    </a-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import {
  getPictureVoByIdUsingGet,
  listPictureTagCategoryUsingGet,
  uploadPictureByBatchUsingPost,
} from '@/api/pictureController.ts'
import { useRoute, useRouter } from 'vue-router'

const formData = reactive<API.PictureUploadByBatchRequest>({
  count: 10,
})
// 提交任务状态
const loading = ref(false)

const router = useRouter()

/**
 * 提交表单
 * @param values
 */
const handleSubmit = async (values: any) => {
  loading.value = true
  const res = await uploadPictureByBatchUsingPost({
    ...formData,
  })
  // 操作成功
  if (res.data.code === 0 && res.data.data) {
    //message.success(`创建成功，共 ${res.data.data} 条`)
    message.success(`Task submitted! It will be displayed on the home page after upload success`)
    // 跳转到主页
    router.push({
      path: `/`,
    })
  } else {
    message.error('Creation failed, ' + res.data.message)
  }
  loading.value = false
}
</script>

<style scoped>
#addPictureBatchPage {
  max-width: 720px;
  margin: 0 auto;
}
</style>
