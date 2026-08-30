<template>
  <div style="max-width: 600px; margin: 40px auto; padding: 0 16px">
    <h2>AI Image Generate</h2>
    <a-textarea
      v-model:value="prompt"
      placeholder="Describe the picture, e.g. a running dog"
      :rows="4"
      style="margin-bottom: 16px"
    />
    <a-button type="primary" :loading="loading" @click="handleGenerate" block>
      Image Generate
    </a-button>
    <div v-if="imageUrl" style="margin-top: 24px; text-align: center">
      <img :src="imageUrl" alt="AI generated image" style="max-width: 100%; border-radius: 8px" />
      <div style="margin-top: 16px">
        <a-button type="primary" @click="handleUseImage">Upload & Edit</a-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { generatePictureUsingPost } from '@/api/pictureController'

const router = useRouter()
const prompt = ref('')
const imageUrl = ref('')
const loading = ref(false)

const handleGenerate = async () => {
  if (!prompt.value.trim()) {
    message.warning('Please input the picture description')
    return
  }
  loading.value = true
  imageUrl.value = ''
  try {
    const res = await generatePictureUsingPost({ prompt: prompt.value })
    if (res.data?.code === 0 && res.data?.data) {
      imageUrl.value = res.data.data
    } else {
      message.error(res.data?.message || 'Generation failed, please try again')
    }
  } catch {
    message.error('Request failed, please check your network')
  } finally {
    loading.value = false
  }
}

const handleUseImage = () => {
  router.push({
    path: '/add_picture',
    query: { generatedUrl: imageUrl.value },
  })
}
</script>
