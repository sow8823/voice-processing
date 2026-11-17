<template>
  <v-app>
    <v-app-bar color="primary" density="compact">
      <v-app-bar-title>音声ピッチ分析</v-app-bar-title>
      <v-spacer></v-spacer>
      <v-btn icon>
        <v-icon>mdi-information</v-icon>
      </v-btn>
    </v-app-bar>

    <v-main>
      <v-container>
        <VoiceVisual />
      </v-container>
    </v-main>

    <v-footer app color="primary" class="text-center d-flex justify-center">
      <span class="text-white">&copy; {{ new Date().getFullYear() }} - 音声ピッチ分析ツール</span>
    </v-footer>
  </v-app>
</template>

<script setup lang="ts">
import VoiceVisual from './components/organisms/VoiceVisual.vue';
</script>
