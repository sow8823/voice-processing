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
                  v-for="(_, pitchId) in analysisResult.pitchResults"
                  :key="String(pitchId)"
                  :value="String(pitchId)"
                >
                  {{ getPitchName(String(pitchId)) }}
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
                <!-- スペクトル傾斜 -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-chart-line-variant</v-icon>
                  </template>
                  <v-list-item-title>スペクトル傾斜</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round(selectedPitchResult?.parameters.spectralSlope ?? 0) }} dB/oct
                    <v-progress-linear
                      :model-value="Math.min(100, Math.abs(((selectedPitchResult?.parameters.spectralSlope ?? 0) + 18) / 12 * 100))"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 非整数次倍音 -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-waveform</v-icon>
                  </template>
                  <v-list-item-title>非整数次倍音の割合</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ Math.round((selectedPitchResult?.parameters.nonIntegerHarmonics ?? 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchResult?.parameters.nonIntegerHarmonics ?? 0) * 100"
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
                    {{ Math.round((selectedPitchResult?.parameters.highFrequencyRatio ?? 0) * 100) }}%
                    <v-progress-linear
                      :model-value="(selectedPitchResult?.parameters.highFrequencyRatio ?? 0) * 100"
                      color="primary"
                      height="5"
                      class="mt-1"
                    ></v-progress-linear>
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <!-- 総合パラメータ表示（総合結果タブでのみ表示） -->
          <v-col cols="12" md="12" v-if="selectedPitchTab === 'overall'">
            <v-card variant="outlined" class="pa-4 mb-4">
              <v-card-title class="text-subtitle-1">
                <v-icon start>mdi-chart-bar</v-icon>
                総合分析パラメータ
              </v-card-title>
              <v-list>
                <!-- スペクトル傾斜（総合） -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-chart-line-variant</v-icon>
                  </template>
                  <v-list-item-title>スペクトル傾斜</v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="overallParams.spectralSlope !== null">
                      低音: {{ Math.round(overallParams.spectralSlope.low) }} dB/oct,
                      中音: {{ Math.round(overallParams.spectralSlope.mid) }} dB/oct,
                      高音: {{ Math.round(overallParams.spectralSlope.high) }} dB/oct
                    </span>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 非整数次倍音（総合） -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-waveform</v-icon>
                  </template>
                  <v-list-item-title>非整数次倍音の割合</v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="overallParams.nonIntegerHarmonics !== null">
                      低音: {{ Math.round(overallParams.nonIntegerHarmonics.low * 100) }}%,
                      中音: {{ Math.round(overallParams.nonIntegerHarmonics.mid * 100) }}%,
                      高音: {{ Math.round(overallParams.nonIntegerHarmonics.high * 100) }}%
                    </span>
                  </v-list-item-subtitle>
                </v-list-item>

                <!-- 高周波成分（総合） -->
                <v-list-item>
                  <template v-slot:prepend>
                    <v-icon>mdi-sine-wave</v-icon>
                  </template>
                  <v-list-item-title>高周波成分の比率</v-list-item-title>
                  <v-list-item-subtitle>
                    <span v-if="overallParams.highFrequencyRatio !== null">
                      低音: {{ Math.round(overallParams.highFrequencyRatio.low * 100) }}%,
                      中音: {{ Math.round(overallParams.highFrequencyRatio.mid * 100) }}%,
                      高音: {{ Math.round(overallParams.highFrequencyRatio.high * 100) }}%
                    </span>
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
                    <v-list-item><v-list-item-title>柔らかく、なめらかな聞き心地</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>声帯閉鎖が弱く、閉鎖部分が薄い</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>ファルセットに近い状態で発声されることが多い</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>音量が小さく、伴奏に埋もれやすい</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>音程がシャープしやすい</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="pull">
                  <v-list>
                    <v-list-item><v-list-item-title>舌根などにも連動して力が入り、仮声帯の振動を伴う</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>非整数次倍音が多く、歪んだような音色となり力強く聞こえる</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>音程がフラットしやすく、換声点付近で苦しそうに聞こえる</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>音量が大きい</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="flip">
                  <v-list>
                    <v-list-item><v-list-item-title>中高音域で声が「ひっくり返る」ように変化する</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>低音域と高音域で声質が極端に異なる</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>音域によってニュアンスを大きく変化させることができる</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>

                <v-window-item value="mixed">
                  <v-list>
                    <v-list-item><v-list-item-title>非整数次倍音が少なく、歪みが少ない</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>共鳴が豊かで、伴奏に埋もれにくく、音量も大きく明瞭</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>低音域から高音域まで、ニュアンスを揃えたまま発声</v-list-item-title></v-list-item>
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
import { ref, computed, watch } from 'vue';
import type { VoiceTypeAnalysisResult, VoiceType } from '../../services/VoiceTypeAnalysisService';

type MultiParam = { low: number; mid: number; high: number };

// プロパティ
const props = defineProps<{
  analysisResult: VoiceTypeAnalysisResult | null;
}>();

// リアクティブな状態
const selectedPitchTab = ref<string>('overall');
const voiceTypeInfoTab = ref<string>('lightChest');

// 分析結果が変更されたときにボイスタイプのタブを更新
watch(() => props.analysisResult, (newResult) => {
  if (newResult) {
    voiceTypeInfoTab.value = newResult.voiceType;
    selectedPitchTab.value = 'overall';
  }
}, { immediate: true });

// 型ガード
const isMultiParam = (v: number | MultiParam): v is MultiParam =>
  typeof v === 'object' && v !== null && 'low' in v;

// 総合パラメータを安全に取得するcomputed
const overallParams = computed(() => {
  const p = props.analysisResult?.parameters;
  if (!p) return { spectralSlope: null, nonIntegerHarmonics: null, highFrequencyRatio: null };

  return {
    spectralSlope: isMultiParam(p.spectralSlope) ? p.spectralSlope : null,
    nonIntegerHarmonics: isMultiParam(p.nonIntegerHarmonics) ? p.nonIntegerHarmonics : null,
    highFrequencyRatio: isMultiParam(p.highFrequencyRatio) ? p.highFrequencyRatio : null,
  };
});

// 音程IDから表示名を取得する関数
const getPitchName = (pitchId: string): string => {
  const pitchNames: Record<string, string> = {
    e3: 'E3 (低音)',
    a3: 'A3 (低音)',
    e4: 'E4 (中音)',
    a4: 'A4 (中音/高音)',
    e5: 'E5 (高音)',
  };
  return pitchNames[pitchId] ?? pitchId.toUpperCase();
};

// 選択された音程の分析結果を取得する計算プロパティ
const selectedPitchResult = computed(() => {
  if (!props.analysisResult?.pitchResults || selectedPitchTab.value === 'overall') return null;
  return props.analysisResult.pitchResults[selectedPitchTab.value] ?? null;
});

// ボイスタイプに応じた色を取得する関数
const getVoiceTypeColor = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest': return 'light-blue';
    case 'pull': return 'deep-orange';
    case 'flip': return 'purple';
    case 'mixed': return 'green';
    default: return 'grey';
  }
};

// ボイスタイプに応じたアイコンを取得する関数
const getVoiceTypeIcon = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest': return 'mdi-weather-windy';
    case 'pull': return 'mdi-weight-lifter';
    case 'flip': return 'mdi-swap-vertical';
    case 'mixed': return 'mdi-tune-vertical';
    default: return 'mdi-help-circle';
  }
};

// ボイスタイプに応じた名前を取得する関数
const getVoiceTypeName = (voiceType: VoiceType): string => {
  switch (voiceType) {
    case 'lightChest': return 'ライトチェスト';
    case 'pull': return 'プル';
    case 'flip': return 'フリップ';
    case 'mixed': return 'ミックス';
    default: return '不明';
  }
};
</script>

<style scoped>
.voice-type-result {
  width: 100%;
}
</style>
