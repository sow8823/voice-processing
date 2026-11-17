<template>
  <div class="voice-type-result-composite">
    <v-card v-if="analysisResult" class="mt-6">
      <v-card-title class="text-center text-h5">
        <v-icon start icon="mdi-dna" class="mr-2"></v-icon>
        複合型ボイスタイプ診断結果
      </v-card-title>
      <v-card-subtitle class="text-center">
        各音程でのボイスタイプ特徴の出現状況をもとに、複合的なボイスタイプを診断しています
      </v-card-subtitle>
      <v-card-text>
        <v-row>
          <v-col cols="12">
            <v-card variant="outlined" class="pa-4 mb-4">
              <v-card-title class="text-subtitle-1 mb-2">
                <v-icon start>mdi-check-circle-outline</v-icon>
                検出されたボイスタイプ要素
              </v-card-title>
              <div
                v-if="analysisResult.detectedTypes.length === 0 || (analysisResult.detectedTypes.length === 1 && analysisResult.detectedTypes[0] === 'unknown')"
                class="text-body-2 text-medium-emphasis"
              >特定のボイスタイプ特徴が検出されませんでした。</div>
              <div v-else class="d-flex flex-wrap gap-3">
                <v-chip v-for="vt in analysisResult.detectedTypes.filter(t => t !== 'unknown')" :key="vt" :color="getVoiceTypeColor(vt)" size="large" class="pa-4">
                  <v-icon start>{{ getVoiceTypeIcon(vt) }}</v-icon>
                  <span class="text-subtitle-1 font-weight-bold">{{ getVoiceTypeName(vt) }}</span>
                  <span class="ml-2 text-body-2">{{ analysisResult.voiceTypeScores[vt] }}%</span>
                </v-chip>
              </div>
            </v-card>
          </v-col>
          <v-col cols="12">
            <v-card variant="outlined" class="pa-4 mb-4">
              <v-card-title class="text-subtitle-1 mb-2">
                <v-icon start>mdi-chart-bar</v-icon>
                ボイスタイプ別スコア（出現率）
              </v-card-title>
              <div v-for="vt in scoreVoiceTypes" :key="vt" class="mb-3">
                <div class="d-flex align-center mb-1">
                  <v-icon size="small" :color="getVoiceTypeColor(vt)" class="mr-2">{{ getVoiceTypeIcon(vt) }}</v-icon>
                  <span class="text-body-2 font-weight-medium" style="min-width:120px">{{ getVoiceTypeName(vt) }}</span>
                  <span class="text-body-2 ml-2">{{ analysisResult.voiceTypeScores[vt] }}%</span>
                </div>
                <v-progress-linear :model-value="analysisResult.voiceTypeScores[vt]" :color="getVoiceTypeColor(vt)" height="12" rounded bg-color="grey-lighten-3"></v-progress-linear>
              </div>
            </v-card>
          </v-col>
          <v-col cols="12">
            <v-card variant="outlined" class="pa-4 mb-4">
              <v-card-title class="text-subtitle-1 mb-2">
                <v-icon start>mdi-music-note</v-icon>
                音程別ボイスタイプ特徴
              </v-card-title>
              <v-tabs v-model="selectedPitchTab" class="mb-4">
                <v-tab value="summary">サマリー</v-tab>
                <v-tab v-for="(_, pitchId) in analysisResult.pitchResults" :key="String(pitchId)" :value="String(pitchId)">
                  {{ getPitchName(String(pitchId)) }}
                </v-tab>
              </v-tabs>
              <div v-if="selectedPitchTab === 'summary'">
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th>音程</th>
                      <th v-for="vt in scoreVoiceTypes" :key="vt" class="text-center">
                        <v-icon size="small" :color="getVoiceTypeColor(vt)">{{ getVoiceTypeIcon(vt) }}</v-icon>
                        <div class="text-caption">{{ getVoiceTypeName(vt) }}</div>
                      </th>
                      <th class="text-center">声区</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(result, pitchId) in analysisResult.pitchResults" :key="String(pitchId)">
                      <td class="font-weight-medium">{{ getPitchName(String(pitchId)) }}</td>
                      <!-- ライトチェスト：全音程が算定対象 -->
                      <td class="text-center">
                        <v-icon :color="result.detectedFeatures.lightChest ? 'light-blue' : 'grey-lighten-2'" size="small">
                          {{ result.detectedFeatures.lightChest ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                        </v-icon>
                      </td>
                      <!-- プル：全音程が算定対象 -->
                      <td class="text-center">
                        <v-icon :color="result.detectedFeatures.pull ? 'deep-orange' : 'grey-lighten-2'" size="small">
                          {{ result.detectedFeatures.pull ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                        </v-icon>
                      </td>
                      <!-- フリップ：低音は対象外、中音=低→中の変化、高音=中→高の変化 -->
                      <td class="text-center">
                        <span v-if="isLowPitch(String(pitchId))" class="text-medium-emphasis text-caption">-</span>
                        <v-icon v-else :color="result.detectedFeatures.flip ? 'purple' : 'grey-lighten-2'" size="small">
                          {{ result.detectedFeatures.flip ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                        </v-icon>
                      </td>
                      <!-- ミックス：全音程が算定対象 -->
                      <td class="text-center">
                        <v-icon :color="result.detectedFeatures.mixed ? 'green' : 'grey-lighten-2'" size="small">
                          {{ result.detectedFeatures.mixed ? 'mdi-check-circle' : 'mdi-circle-outline' }}
                        </v-icon>
                      </td>
                      <td class="text-center"><v-chip size="x-small" :color="getRegisterColor(result.voiceRegister)">{{ getRegisterName(result.voiceRegister) }}</v-chip></td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
              <div v-else-if="selectedPitchResult">
                <div class="mb-4">
                  <div class="text-body-2 font-weight-medium mb-2">検出されたボイスタイプ特徴:</div>
                  <div class="d-flex flex-wrap gap-2">
                    <template v-for="vt in scoreVoiceTypes" :key="vt">
                      <v-chip v-if="getFeatureForType(selectedPitchResult.detectedFeatures, vt)" :color="getVoiceTypeColor(vt)" size="small">
                        <v-icon start size="small">{{ getVoiceTypeIcon(vt) }}</v-icon>{{ getVoiceTypeName(vt) }}
                      </v-chip>
                    </template>
                    <v-chip v-if="!hasAnyFeature(selectedPitchResult.detectedFeatures)" color="grey" size="small">特徴なし</v-chip>
                  </div>
                </div>
                <div class="mb-4">
                  <div class="text-body-2 font-weight-medium mb-2">声区:</div>
                  <v-chip :color="getRegisterColor(selectedPitchResult.voiceRegister)" size="small">{{ getRegisterName(selectedPitchResult.voiceRegister) }}</v-chip>
                </div>
                <v-list density="compact">
                  <v-list-item>
                    <template v-slot:prepend><v-icon>mdi-chart-line-variant</v-icon></template>
                    <v-list-item-title>スペクトル傾斜</v-list-item-title>
                    <v-list-item-subtitle>{{ Math.round(selectedPitchResult.parameters.spectralSlope) }} dB/oct
                      <v-progress-linear :model-value="Math.min(100,Math.abs(((selectedPitchResult.parameters.spectralSlope)+18)/12*100))" color="primary" height="5" class="mt-1"></v-progress-linear>
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template v-slot:prepend><v-icon>mdi-waveform</v-icon></template>
                    <v-list-item-title>非整数次倍音の割合</v-list-item-title>
                    <v-list-item-subtitle>{{ Math.round(selectedPitchResult.parameters.nonIntegerHarmonics * 100) }}%
                      <v-progress-linear :model-value="selectedPitchResult.parameters.nonIntegerHarmonics * 100" color="primary" height="5" class="mt-1"></v-progress-linear>
                    </v-list-item-subtitle>
                  </v-list-item>
                  <v-list-item>
                    <template v-slot:prepend><v-icon>mdi-high-definition</v-icon></template>
                    <v-list-item-title>高周波成分の比率</v-list-item-title>
                    <v-list-item-subtitle>{{ Math.round(selectedPitchResult.parameters.highFrequencyRatio * 100) }}%
                      <v-progress-linear :model-value="Math.min(100, selectedPitchResult.parameters.highFrequencyRatio * 100)" color="primary" height="5" class="mt-1"></v-progress-linear>
                    </v-list-item-subtitle>
                  </v-list-item>
                </v-list>
              </div>
            </v-card>
          </v-col>


          <v-col cols="12" v-if="analysisResult.detectedTypes.filter(t => t !== 'unknown').length > 0">
            <v-card variant="outlined" class="pa-4">
              <v-card-title class="text-subtitle-1 mb-2">
                <v-icon start>mdi-information-outline</v-icon>
                検出されたボイスタイプの特徴説明
              </v-card-title>
              <v-tabs v-model="voiceTypeInfoTab" class="mb-4">
                <v-tab v-for="vt in analysisResult.detectedTypes.filter(t => t !== 'unknown')" :key="vt" :value="vt">
                  <v-icon start size="small" :color="getVoiceTypeColor(vt)">{{ getVoiceTypeIcon(vt) }}</v-icon>
                  {{ getVoiceTypeName(vt) }}
                </v-tab>
              </v-tabs>
              <v-window v-model="voiceTypeInfoTab">
                <v-window-item value="lightChest">
                  <v-list density="compact">
                    <v-list-item><v-list-item-title>高周波成分が少ない（裏声・軽い声の特徴）</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>スペクトル傾斜が急（基音が強く、倍音が弱い）</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>声量が控えめで、共鳴が浅い傾向</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>
                <v-window-item value="pull">
                  <v-list density="compact">
                    <v-list-item><v-list-item-title>高周波成分が強く（2〜5kHz帯域）、非整数次倍音が多い</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>地声を高音域に引き上げる特徴（押し上げ型）</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>声帯への負荷が高く、声が張った印象になりやすい</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>
                <v-window-item value="flip">
                  <v-list density="compact">
                    <v-list-item><v-list-item-title>音程によって声区が大きく変わる（声のひっくり返り）</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>地声から裏声への急激な切り替えが発生している</v-list-item-title></v-list-item>
                    <v-list-item><v-list-item-title>声区の移行点でフリップ（声の切れ）が起きている</v-list-item-title></v-list-item>
                  </v-list>
                </v-window-item>
                <v-window-item value="mixed">
                  <v-list density="compact">
                    <v-list-item><v-list-item-title>高周波成分が強く、非整数次倍音が少ない（クリーンな声）</v-list-item-title></v-list-item>
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
import type { CompositeVoiceTypeAnalysisResult, VoiceType, VoiceRegister } from '../../services/VoiceTypeAnalysisService';

const props = defineProps<{ analysisResult: CompositeVoiceTypeAnalysisResult | null; }>();

const selectedPitchTab = ref<string>('summary');
const voiceTypeInfoTab = ref<string>('lightChest');
const scoreVoiceTypes: VoiceType[] = ['lightChest', 'pull', 'flip', 'mixed'];

watch(() => props.analysisResult, (r) => {
  if (r) {
    selectedPitchTab.value = 'summary';
    if (r.detectedTypes.length > 0 && r.detectedTypes[0] !== 'unknown') voiceTypeInfoTab.value = r.detectedTypes[0];
  }
}, { immediate: true });

const selectedPitchResult = computed(() => {
  if (!props.analysisResult?.pitchResults || selectedPitchTab.value === 'summary') return null;
  return props.analysisResult.pitchResults[selectedPitchTab.value] ?? null;
});

const getPitchName = (id: string): string => ({ e3:'E3 (低音)', a3:'A3 (低音)', e4:'E4 (中音)', a4:'A4 (中音/高音)', e5:'E5 (高音)' } as Record<string,string>)[id] ?? id.toUpperCase();
const getVoiceTypeColor = (vt: VoiceType): string => ({ lightChest:'light-blue', pull:'deep-orange', flip:'purple', mixed:'green', unknown:'grey' } as Record<VoiceType,string>)[vt] ?? 'grey';
const getVoiceTypeIcon = (vt: VoiceType): string => ({ lightChest:'mdi-weather-windy', pull:'mdi-weight-lifter', flip:'mdi-swap-vertical', mixed:'mdi-tune-vertical', unknown:'mdi-help-circle' } as Record<VoiceType,string>)[vt] ?? 'mdi-help-circle';
const getVoiceTypeName = (vt: VoiceType): string => ({ lightChest:'ライトチェスト', pull:'プル', flip:'フリップ', mixed:'ミックス', unknown:'不明' } as Record<VoiceType,string>)[vt] ?? '不明';
const getRegisterColor = (reg: VoiceRegister): string => ({ modal:'orange', middle:'teal', falsetto:'blue' } as Record<VoiceRegister,string>)[reg] ?? 'grey';
const getRegisterName = (reg: VoiceRegister): string => ({ modal:'地声', middle:'中間', falsetto:'裏声' } as Record<VoiceRegister,string>)[reg] ?? '不明';
const hasAnyFeature = (f: { lightChest: boolean; pull: boolean; flip: boolean; mixed: boolean }): boolean => f.lightChest || f.pull || f.flip || f.mixed;
const isLowPitch = (pitchId: string): boolean => pitchId === 'e3' || pitchId === 'a3';
const getFeatureForType = (f: { lightChest: boolean; pull: boolean; flip: boolean; mixed: boolean }, vt: VoiceType): boolean => {
  if (vt === 'lightChest') return f.lightChest;
  if (vt === 'pull') return f.pull;
  if (vt === 'flip') return f.flip;
  if (vt === 'mixed') return f.mixed;
  return false;
};
</script>

<style scoped>
.voice-type-result-composite { width: 100%; }
.gap-3 { gap: 12px; }
.gap-2 { gap: 8px; }
</style>

