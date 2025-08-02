<template>
  <div class="voice-type-result">
    <v-card v-if="analysisResult" class="mt-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-account-voice" class="mr-2"></v-icon>
        ボイスタイプ分類結果
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
          
          <!-- パラメータ表示（音程別タブでのみ表示） -->
          <v-col cols="12" md="12" v-if="selectedPitchTab !== 'overall'">
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
                  <v-list-item-subtitle v-if="selectedPitchTab === 'overall'">
                    <div v-if="analysisResult.parameters.spectralSlope.low !== undefined">
                      低音: {{ Math.round(analysisResult.parameters.spectralSlope.low) }} dB/oct,
                      中音: {{ Math.round(analysisResult.parameters.spectralSlope.mid) }} dB/oct,
                      高音: {{ Math.round(analysisResult.parameters.spectralSlope.high) }} dB/oct
                      <v-progress-linear
                        :model-value="Math.min(100, Math.abs((analysisResult.parameters.spectralSlope.low + 18) / 12 * 100))"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                    <div v-else>
                      {{ Math.round(analysisResult.parameters.spectralSlope) }} dB/oct
                      <v-progress-linear
                        :model-value="Math.min(100, Math.abs(((analysisResult.parameters.spectralSlope) + 18) / 12 * 100))"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                  </v-list-item-subtitle>
                  <v-list-item-subtitle v-else>
                    {{ Math.round(selectedPitchResult?.parameters.spectralSlope || 0) }} dB/oct
                    <v-progress-linear
                      :model-value="Math.min(100, Math.abs(((selectedPitchResult?.parameters.spectralSlope || 0) + 18) / 12 * 100))"
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
                  <v-list-item-title>非整数次倍音の割合</v-list-item-title>
                  <v-list-item-subtitle v-if="selectedPitchTab === 'overall'">
                    <div v-if="analysisResult.parameters.nonIntegerHarmonics.low !== undefined">
                      低音: {{ Math.round(analysisResult.parameters.nonIntegerHarmonics.low * 100) }}%,
                      中音: {{ Math.round(analysisResult.parameters.nonIntegerHarmonics.mid * 100) }}%,
                      高音: {{ Math.round(analysisResult.parameters.nonIntegerHarmonics.high * 100) }}%
                      <v-progress-linear
                        :model-value="analysisResult.parameters.nonIntegerHarmonics.low * 100"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                    <div v-else>
                      {{ Math.round(analysisResult.parameters.nonIntegerHarmonics * 100) }}%
                      <v-progress-linear
                        :model-value="analysisResult.parameters.nonIntegerHarmonics * 100"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                  </v-list-item-subtitle>
                  <v-list-item-subtitle v-else>
                    {{ Math.round((selectedPitchResult?.parameters.nonIntegerHarmonics || 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchResult?.parameters.nonIntegerHarmonics || 0) * 100"
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
                  <v-list-item-subtitle v-if="selectedPitchTab === 'overall'">
                    <div v-if="analysisResult.parameters.highFrequencyRatio.low !== undefined">
                      低音: {{ Math.round(analysisResult.parameters.highFrequencyRatio.low * 100) }}%,
                      中音: {{ Math.round(analysisResult.parameters.highFrequencyRatio.mid * 100) }}%,
                      高音: {{ Math.round(analysisResult.parameters.highFrequencyRatio.high * 100) }}%
                      <v-progress-linear
                        :model-value="analysisResult.parameters.highFrequencyRatio.low * 100"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                    <div v-else>
                      {{ Math.round(analysisResult.parameters.highFrequencyRatio * 100) }}%
                      <v-progress-linear
                        :model-value="analysisResult.parameters.highFrequencyRatio * 100"
                        color="primary"
                        height="5"
                        class="mt-1"
                      ></v-progress-linear>
                    </div>
                  </v-list-item-subtitle>
                  <v-list-item-subtitle v-else>
                    {{ Math.round((selectedPitchResult?.parameters.highFrequencyRatio || 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchResult?.parameters.highFrequencyRatio || 0) * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>
          
          <!-- 判定基準の説明（総合結果タブでのみ表示） -->
          <v-col cols="12" md="12" v-if="selectedPitchTab === 'overall'">
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
                      <v-list-item-title>柔らかく、なめらかな聞き心地</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>声帯閉鎖が弱く、閉鎖部分が薄い</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>ファルセットに近い状態で発声されることが多い</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>音量が小さく、伴奏に埋もれやすい</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>音程がシャープしやすい</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>
                
                <v-window-item value="pull">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>舌根などにも連動して力が入り、仮声帯の振動を伴う</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>非整数次倍音が多く、歪んだような音色となり力強く聞こえる</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>音程がフラットしやすく、換声点付近で苦しそうに聞こえる</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>音量が大きい</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="flip">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>中高音域で声が「ひっくり返る」ように変化する</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>低音域と高音域で声質が極端に異なる</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>音域によってニュアンスを大きく変化させることができる</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="mixed">
                  <v-list>
                    <v-list-item>
                      <v-list-item-title>非整数次倍音が少なく、歪みが少ない</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>共鳴が豊かで、伴奏に埋もれにくく、音量も大きく明瞭</v-list-item-title>
                    </v-list-item>
                    <v-list-item>
                      <v-list-item-title>低音域から高音域まで、ニュアンスを揃えたまま発声</v-list-item-title>
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
import { ref, computed, watch } from "vue";
import type { VoiceTypeAnalysisResult, VoiceType } from "../../services/VoiceTypeAnalysisService";

// プロパティ
const props = defineProps<{
  analysisResult: VoiceTypeAnalysisResult | null;
  selectedNote?: string;
}>();

// デフォルト値を持つ計算プロパティ
const selectedNote = computed(() => props.selectedNote || 'A4');

// リアクティブな状態
const selectedPitchTab = ref<string>("overall");
const voiceTypeInfoTab = ref<string>("lightChest");

// 分析結果が変更されたときにボイスタイプのタブを更新
watch(() => props.analysisResult, (newResult) => {
  if (newResult) {
    voiceTypeInfoTab.value = newResult.voiceType;
  }
}, { immediate: true });

// 音程IDから表示名を取得する関数
const getPitchName = (pitchId: string): string => {
  const pitchNames: Record<string, string> = {
    'e3': 'E3 (低音)',
    'a3': 'A3 (低音)',
    'e4': 'E4 (中音)',
    'a4': 'A4 (中音/高音)',
    'e5': 'E5 (高音)'
  };
  
  // pitchIdがundefinedの場合のエラー処理を追加
  if (!pitchId) return '不明な音程';
  
  return pitchNames[pitchId] || pitchId.toUpperCase();
};

// 選択された音程の分析結果を取得する計算プロパティ
const selectedPitchResult = computed(() => {
  // 計算プロパティ内では.valueを使う必要がある
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