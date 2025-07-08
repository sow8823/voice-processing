<template>
  <div class="voice-type-result">
    <v-card v-if="analysisResult" class="mt-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-account-voice" class="mr-2"></v-icon>
        ボイスタイプ分析結果
      </v-card-title>
      
      <v-card-text>
        <v-row>
          <!-- 声質タイプの表示 -->
          <v-col cols="12" class="text-center">
            <div class="mb-2">
              <v-chip
                size="small"
                color="primary"
                class="mb-2"
              >
                <v-icon start>mdi-music-note</v-icon>
                <span>分析音高: {{ selectedNote || 'A4' }} ({{ noteFrequencyMap[selectedNote || 'A4'] }} Hz)</span>
              </v-chip>
            </div>
            
            <v-chip
              size="x-large"
              :color="getVoiceTypeColor(analysisResult.voiceType)"
              class="pa-4 mb-4"
            >
              <v-icon start>{{ getVoiceTypeIcon(analysisResult.voiceType) }}</v-icon>
              <span class="text-h6">{{ getVoiceTypeName(analysisResult.voiceType) }}</span>
            </v-chip>
            
            <!-- 確信度表示 -->
            <div class="mt-2">
              <span class="text-subtitle-1">確信度: {{ Math.round(analysisResult.confidence * 100) }}%</span>
              <v-progress-linear
                :model-value="analysisResult.confidence * 100"
                :color="getVoiceTypeColor(analysisResult.voiceType)"
                height="10"
                rounded
                class="mt-2"
              ></v-progress-linear>
            </div>
          </v-col>
          
          <!-- パラメータ表示 -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" class="pa-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-chart-bar</v-icon>
                分析パラメータ
              </v-card-title>
              
              <v-list>
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-sine-wave</v-icon>
                  </template>
                  <v-list-item-title>第2倍音/基本周波数比率</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.harmonic2Ratio) }}%
                    <v-progress-linear
                      :model-value="Math.min(100, analysisResult.parameters.harmonic2Ratio)"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
                
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-sine-wave</v-icon>
                  </template>
                  <v-list-item-title>第3倍音/基本周波数比率</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.harmonic3Ratio) }}%
                    <v-progress-linear
                      :model-value="Math.min(100, analysisResult.parameters.harmonic3Ratio)"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
                
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-chart-bell-curve</v-icon>
                  </template>
                  <v-list-item-title>高周波数帯域エネルギー比率</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.highFrequencyRatio * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.highFrequencyRatio * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
                
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-waveform</v-icon>
                  </template>
                  <v-list-item-title>ノイズ成分の割合</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.noiseRatio * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.noiseRatio * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 新しいパラメータ（存在する場合のみ表示） -->
                <v-list-item v-if="analysisResult.parameters.voiceConsistency !== undefined">
                  <template v-slot:prepend>
                    <v-icon>mdi-tune-vertical</v-icon>
                  </template>
                  <v-list-item-title>声質の一貫性</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.voiceConsistency * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.voiceConsistency * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <v-list-item v-if="analysisResult.parameters.voiceQualityChange !== undefined">
                  <template v-slot:prepend>
                    <v-icon>mdi-swap-vertical</v-icon>
                  </template>
                  <v-list-item-title>声質変化の度合い</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.voiceQualityChange * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.voiceQualityChange * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <v-list-item v-if="analysisResult.parameters.brightness3kHz !== undefined">
                  <template v-slot:prepend>
                    <v-icon>mdi-brightness-6</v-icon>
                  </template>
                  <v-list-item-title>3kHz周辺の強さ</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.brightness3kHz * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.brightness3kHz * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
          
          <!-- 判定基準の説明 -->
          <v-col cols="12" md="6">
            <v-card variant="outlined" class="pa-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-information-outline</v-icon>
                ボイスタイプの特徴
              </v-card-title>
              
              <v-tabs v-model="voiceTypeInfoTab">
                <v-tab value="lightChest">ライトチェスト</v-tab>
                <v-tab value="pull">プル</v-tab>
                <v-tab value="flip">フリップ</v-tab>
                <v-tab value="mixed">ミックス</v-tab>
              </v-tabs>
              
              <v-window v-model="voiceTypeInfoTab" class="mt-2">
                <v-window-item value="lightChest">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>息漏れが多い</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>基本周波数の振幅が他の倍音成分と比べて大きい</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>高周波数帯域のエネルギーが比較的少ない</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>
                
                <v-window-item value="pull">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>地声感が強い</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>倍音成分が基本周波数成分と同等以上の大きさがみられる</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>高周波数帯域にもエネルギーが分布している</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="flip">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>低音と高音の間で声質が著しく変化する</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>低音では倍音が豊かで声量が大きい</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>高音では基音優位になり声量が小さくなる</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>特定の音程で声質が急激に変化する（ヨーデル的特徴）</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="mixed">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>低音から高音まで声質の変化が少ない</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>全体的に声量が大きい</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>倍音成分が豊か</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>3kHz周辺の周波数成分が強く、明るく響く声</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>
              </v-window>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { VoiceTypeAnalysisResult, VoiceType } from "../../services/VoiceTypeAnalysisService";

// プロパティ
const props = defineProps<{
  analysisResult: VoiceTypeAnalysisResult | null;
  selectedNote?: string;
}>();

// デフォルト値を持つ計算プロパティ
const selectedNote = computed(() => props.selectedNote || 'A4');

// リアクティブな状態
const voiceTypeInfoTab = ref<string>("lightChest");

// 音高と周波数のマッピング
const noteFrequencyMap: Record<string, number> = {
  // A3 (57) から A5 (81) までの音高と周波数のマッピング
  "A3": 220.00,
  "A#3": 233.08,
  "B3": 246.94,
  "C4": 261.63,
  "C#4": 277.18,
  "D4": 293.66,
  "D#4": 311.13,
  "E4": 329.63,
  "F4": 349.23,
  "F#4": 369.99,
  "G4": 392.00,
  "G#4": 415.30,
  "A4": 440.00,
  "A#4": 466.16,
  "B4": 493.88,
  "C5": 523.25,
  "C#5": 554.37,
  "D5": 587.33,
  "D#5": 622.25,
  "E5": 659.25,
  "F5": 698.46,
  "F#5": 739.99,
  "G5": 783.99,
  "G#5": 830.61,
  "A5": 880.00
};

// ボイスタイプに応じた色を取得する関数
const getVoiceTypeColor = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'light-blue';
    case 'pull':
      return 'deep-orange';
    case 'flip':
      return 'purple';
    case 'mixed':
      return 'green';
    default:
      return 'grey';
  }
};

// ボイスタイプに応じたアイコンを取得する関数
const getVoiceTypeIcon = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'mdi-weather-windy';
    case 'pull':
      return 'mdi-weight-lifter';
    case 'flip':
      return 'mdi-swap-vertical';
    case 'mixed':
      return 'mdi-tune-vertical';
    default:
      return 'mdi-help-circle';
  }
};

// ボイスタイプに応じた名前を取得する関数
const getVoiceTypeName = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest':
      return 'ライトチェスト';
    case 'pull':
      return 'プル';
    case 'flip':
      return 'フリップ';
    case 'mixed':
      return 'ミックス';
    default:
      return '不明';
  }
};
</script>

<style scoped>
.voice-type-result {
  width: 100%;
}
</style>