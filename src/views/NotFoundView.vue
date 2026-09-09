<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { CardX } from '@/components/ui/card-x'
import { Empty } from '@/components/ui/empty'

const router = useRouter()
</script>

<template>
  <div class="px-4 pt-4 pb-4">
    <CardX>
      <Empty icon="tabler:map-pin-off" description="页面不存在">
        <template #extra>
          <Button @click="router.push('/')">
            返回首页
          </Button>
        </template>
      </Empty>
    </CardX>
  </div>
</template>
