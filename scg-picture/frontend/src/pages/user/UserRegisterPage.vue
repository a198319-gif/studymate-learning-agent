<template>
  <div id="userRegisterPage">
    <div class="auth-card">
      <img class="auth-logo" src="../../assets/logo.png" alt="SCG Cloud Gallery" />
      <div class="eyebrow">Create your workspace</div>
      <h2 class="title">Join SCG Cloud Gallery</h2>
      <div class="desc">Enterprise Intelligent Collaborative Cloud Gallery</div>
      <a-form :model="formState" name="basic" autocomplete="off" @finish="handleSubmit">
      <a-form-item name="userAccount" :rules="[{ required: true, message: 'Please enter account' }]">
        <a-input v-model:value="formState.userAccount" placeholder="Enter account" />
      </a-form-item>
      <a-form-item
        name="userPassword"
        :rules="[
          { required: true, message: 'Please enter password' },
          { min: 8, message: 'Password length must be at least 8 characters' },
        ]"
      >
        <a-input-password v-model:value="formState.userPassword" placeholder="Enter password" />
      </a-form-item>
      <a-form-item
        name="checkPassword"
        :rules="[
          { required: true, message: 'Please enter confirm password' },
          { min: 8, message: 'Confirm password length must be at least 8 characters' },
        ]"
      >
        <a-input-password v-model:value="formState.checkPassword" placeholder="Enter confirm password" />
      </a-form-item>
      <div class="tips">
        Have an account?
        <RouterLink to="/user/login">Login now</RouterLink>
      </div>
      <a-form-item>
        <a-button type="primary" html-type="submit" style="width: 100%">Register</a-button>
      </a-form-item>
      </a-form>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { reactive } from 'vue'
import { userRegisterUsingPost } from '@/api/userController.ts'
import { useLoginUserStore } from '@/stores/useLoginUserStore.ts'
import { message } from 'ant-design-vue'
import router from '@/router' // 用于接受表单输入的值

// 用于接受表单输入的值
const formState = reactive<API.UserRegisterRequest>({
  userAccount: '',
  userPassword: '',
  checkPassword: '',
})

const loginUserStore = useLoginUserStore()

/**
 * 提交表单
 * @param values
 */
const handleSubmit = async (values: any) => {
  // 校验两次输入的密码是否一致
  if (values.userPassword !== values.checkPassword) {
    message.error('The passwords entered twice do not match')
    return
  }
  const res = await userRegisterUsingPost(values)
  // 注册成功，跳转到登录页面
  if (res.data.code === 0 && res.data.data) {
    message.success('Registration successful')
    router.push({
      path: '/user/login',
      replace: true,
    })
  } else {
    message.error('Registration failed, ' + res.data.message)
  }
}
</script>

<style scoped>
#userRegisterPage {
  display: grid;
  min-height: calc(100vh - 190px);
  place-items: center;
  padding: 32px 16px;
}

.auth-card {
  width: min(440px, 100%);
  padding: 36px;
  background: rgba(11, 29, 51, 0.9);
  border: 1px solid var(--scg-border);
  border-radius: 18px;
  box-shadow: var(--scg-shadow);
}

.auth-logo {
  display: block;
  width: 54px;
  height: 54px;
  margin: 0 auto 16px;
  object-fit: cover;
  border: 1px solid var(--scg-border-strong);
  border-radius: 12px;
}

.eyebrow {
  margin-bottom: 8px;
  color: #5eead4;
  font-size: 12px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-align: center;
  text-transform: uppercase;
}

.title {
  color: var(--scg-text);
  text-align: center;
  margin-bottom: 8px;
  font-size: 24px;
  letter-spacing: -0.025em;
}

.desc {
  text-align: center;
  color: var(--scg-text-muted);
  margin-bottom: 24px;
}

.tips {
  color: var(--scg-text-muted);
  text-align: right;
  font-size: 13px;
  margin-bottom: 16px;
}

@media (max-width: 520px) {
  .auth-card {
    padding: 26px 20px;
  }
}
</style>
