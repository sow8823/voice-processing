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
            
            <v-chip
              size="x-large"
              :color="getVoiceTypeColor(analysisResult.voiceType)"
              class="pa-4 mb-4"
            >
              <v-icon start>{{ getVoiceTypeIcon(analysisResult.voiceType) }}</v-icon>
              <span class="text-h6">{{ getVoiceTypeName(analysisResult.voiceType) }}</span>
            </v-chip>
            
          </v-col>
          
          <!-- 音程選択タブ -->
          <v-col cols="12" class="mb-4">
            <v-card variant="outlined" class="pa-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-music-note</v-icon>
                音程別分析結果
              </v-card-title>
              
              <v-tabs v-model="selectedPitchTab" class="mt-2">
                <v-tab value="overall">総合結果</v-tab>
                <v-tab
                  v-for="(pitchResult, pitchId) in analysisResult.pitchResults"
                  :key="pitchId"
                  :value="pitchId"
                >
                  {{ getPitchName(pitchId) }}
                </v-tab>
              </v-tabs>
            </v-card>
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
                    <v-icon>mdi-chart-line-variant</v-icon>
                  </template>
                  <v-list-item-title>スペクトル傾斜</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(selectedPitchTab.value === 'overall' ?
                      analysisResult.parameters.spectralSlope :
                      selectedPitchResult?.parameters.spectralSlope || 0) }} dB/oct
                    <v-progress-linear
                      :model-value="Math.min(100, Math.abs(((selectedPitchTab.value === 'overall' ?
                        analysisResult.parameters.spectralSlope :
                        selectedPitchResult?.parameters.spectralSlope || 0) + 18) / 12 * 100))"
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
                    {{ Math.round((selectedPitchTab.value === 'overall' ?
                      analysisResult.parameters.noiseRatio :
                      selectedPitchResult?.parameters.noiseRatio || 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchTab.value === 'overall' ?
                        analysisResult.parameters.noiseRatio :
                        selectedPitchResult?.parameters.noiseRatio || 0) * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 高周波成分の比率 -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-sine-wave</v-icon>
                  </template>
                  <v-list-item-title>高周波成分の比率</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round((selectedPitchTab.value === 'overall' ?
                      analysisResult.parameters.highFrequencyRatio :
                      selectedPitchResult?.parameters.highFrequencyRatio || 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchTab.value === 'overall' ?
                        analysisResult.parameters.highFrequencyRatio :
                        selectedPitchResult?.parameters.highFrequencyRatio || 0) * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 新しいパラメータ（存在する場合のみ表示） -->
                <v-list-item v-if="selectedPitchTab.value === 'overall' && analysisResult.parameters.voiceQualityChange !== undefined">
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

                <v-list-item v-if="selectedPitchTab.value === 'overall' && analysisResult.parameters.pitchAccuracy !== undefined">
                  <template v-slot:prepend>
                    <v-icon>mdi-music-accidental-sharp</v-icon>
                  </template>
                  <v-list-item-title>音程精度</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(analysisResult.parameters.pitchAccuracy * 100) }}%
                    <v-progress-linear
                      :model-value="analysisResult.parameters.pitchAccuracy * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <v-list-item v-if="selectedPitchTab.value === 'overall' && analysisResult.parameters.brightness3kHz !== undefined">
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
          
          <!-- 音程別ボイスタイプ表示 -->
          <v-col cols="12" md="6" v-if="selectedPitchTab.value !== 'overall' && selectedPitchResult">
            <v-card variant="outlined" class="pa-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-music-note</v-icon>
                {{ getPitchName(selectedPitchTab.value) }} の分析結果
              </v-card-title>
              
              <div class="text-center my-4">
                <v-chip
                  size="large"
                  :color="getVoiceTypeColor(selectedPitchResult.voiceType)"
                  class="pa-3"
                >
                  <v-icon start>{{ getVoiceTypeIcon(selectedPitchResult.voiceType) }}</v-icon>
                  <span class="text-subtitle-1">{{ getVoiceTypeName(selectedPitchResult.voiceType) }}</span>
                </v-chip>
                
                <div class="mt-2 text-body-2">
                  確信度: {{ Math.round(selectedPitchResult.confidence * 100) }}%
                </div>
              </div>
              
              <v-divider class="my-3"></v-divider>
              
              <div v-if="selectedPitchResult.voiceRegister" class="text-center my-3">
                <v-chip
                  size="small"
                  :color="getVoiceRegisterColor(selectedPitchResult.voiceRegister)"
                  class="pa-2"
                >
                  {{ getVoiceRegisterName(selectedPitchResult.voiceRegister) }}
                </v-chip>
              </div>
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
const selectedPitchTab = ref<string>("overall");

// 音程IDから表示名を取得する関数
const getPitchName = (pitchId: string): string => {
  const pitchNames: Record<string, string> = {
    'e3': 'E3 (低音)',
    'a3': 'A3 (低音)',
    'e4': 'E4 (中音)',
    'a4': 'A4 (中音/高音)',
    'e5': 'E5 (高音)'
  };
  
  return pitchNames[pitchId] || pitchId.toUpperCase();
};

// 選択された音程の分析結果を取得する計算プロパティ
const selectedPitchResult = computed(() => {
  if (!props.analysisResult || !props.analysisResult.pitchResults || selectedPitchTab.value === 'overall') {
    return null;
  }
  
  return props.analysisResult.pitchResults[selectedPitchTab.value];
});

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

// 声区に応じた色を取得する関数
const getVoiceRegisterColor = (voiceRegister: string): string => {
  switch (voiceRegister) {
    case 'chest':
      return 'amber';
    case 'falsetto':
      return 'light-blue';
    case 'middle':
      return 'teal';
    default:
      return 'grey';
  }
};

// 声区に応じた名前を取得する関数
const getVoiceRegisterName = (voiceRegister: string): string => {
  switch (voiceRegister) {
    case 'chest':
      return '地声';
    case 'falsetto':
      return '裏声';
    case 'middle':
      return '中間声';
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