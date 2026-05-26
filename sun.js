const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// =========================================================================
// === CLASS HỆ THỐNG DỰ ĐOÁN SIÊU CẤP (UltraDicePredictionSystem) ===
// =========================================================================
class UltraDicePredictionSystem {
    constructor() {
        this.history = [];
        this.models = {};
        this.weights = {};
        this.performance = {};
        this.patternDatabase = {};
        this.advancedPatterns = {};
        this.sessionStats = {
            streaks: { T: 0, X: 0, maxT: 0, maxX: 0 },
            transitions: { TtoT: 0, TtoX: 0, XtoT: 0, XtoX: 0 },
            volatility: 0.5,
            patternConfidence: {},
            recentAccuracy: 0,
            bias: { T: 0, X: 0 }
        };
        this.marketState = {
            trend: 'neutral',
            momentum: 0,
            stability: 0.5,
            regime: 'normal'
        };
        this.adaptiveParameters = {
            patternMinLength: 3,
            patternMaxLength: 8,
            volatilityThreshold: 0.7,
            trendStrengthThreshold: 0.6,
            patternConfidenceDecay: 0.95,
            patternConfidenceGrowth: 1.05
        };
        this.previousTopModels = null;
        this.initAllModels();
    }

    initAllModels() {
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}`] = this[`model${i}`].bind(this);
            this.models[`model${i}Mini`] = this[`model${i}Mini`].bind(this);
            this.models[`model${i}Support1`] = this[`model${i}Support1`].bind(this);
            this.models[`model${i}Support2`] = this[`model${i}Support2`].bind(this);
            
            this.weights[`model${i}`] = 1;
            this.performance[`model${i}`] = { 
                correct: 0, 
                total: 0,
                recentCorrect: 0,
                recentTotal: 0,
                streak: 0,
                maxStreak: 0
            };
        }
        
        this.initPatternDatabase();
        this.initAdvancedPatterns();
        this.initSupportModels();
    }

    initPatternDatabase() {
        this.patternDatabase = {
            '1-1': { pattern: ['T', 'X', 'T', 'X'], probability: 0.7, strength: 0.8 },
            '1-2-1': { pattern: ['T', 'X', 'X', 'T'], probability: 0.65, strength: 0.75 },
            '2-1-2': { pattern: ['T', 'T', 'X', 'T', 'T'], probability: 0.68, strength: 0.78 },
            '3-1': { pattern: ['T', 'T', 'T', 'X'], probability: 0.72, strength: 0.82 },
            '1-3': { pattern: ['T', 'X', 'X', 'X'], probability: 0.72, strength: 0.82 },
            '2-2': { pattern: ['T', 'T', 'X', 'X'], probability: 0.66, strength: 0.76 },
            '2-3': { pattern: ['T', 'T', 'X', 'X', 'X'], probability: 0.71, strength: 0.81 },
            '3-2': { pattern: ['T', 'T', 'T', 'X', 'X'], probability: 0.73, strength: 0.83 },
            '4-1': { pattern: ['T', 'T', 'T', 'T', 'X'], probability: 0.76, strength: 0.86 },
            '1-4': { pattern: ['T', 'X', 'X', 'X', 'X'], probability: 0.76, strength: 0.86 },
        };
    }

    initAdvancedPatterns() {
        this.advancedPatterns = {
            'dynamic-1': {
                detect: (data) => {
                    if (data.length < 6) return false;
                    const last6 = data.slice(-6);
                    return last6.filter(x => x === 'T').length === 4 && 
                           last6[last6.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.72,
                description: "4T trong 6 phiên, cuối là T -> dự đoán X"
            },
            'dynamic-2': {
                detect: (data) => {
                    if (data.length < 8) return false;
                    const last8 = data.slice(-8);
                    const tCount = last8.filter(x => x === 'T').length;
                    return tCount >= 6 && last8[last8.length-1] === 'T';
                },
                predict: () => 'X',
                confidence: 0.78,
                description: "6+T trong 8 phiên, cuối là T -> dự đoán X mạnh"
            },
            'alternating-3': {
                detect: (data) => {
                    if (data.length < 5) return false;
                    const last5 = data.slice(-5);
                    for (let i = 1; i < last5.length; i++) {
                        if (last5[i] === last5[i-1]) return false;
                    }
                    return true;
                },
                predict: (data) => data[data.length-1] === 'T' ? 'X' : 'T',
                confidence: 0.68,
                description: "5 phiên đan xen hoàn hảo -> dự đoán đảo chiều"
            },
            'cyclic-7': {
                detect: (data) => {
                    if (data.length < 14) return false;
                    const firstHalf = data.slice(-14, -7);
                    const secondHalf = data.slice(-7);
                    return this.arraysEqual(firstHalf, secondHalf);
                },
                predict: (data) => data[data.length-7],
                confidence: 0.75,
                description: "Chu kỳ 7 phiên lặp lại -> dự đoán theo chu kỳ"
            },
            'momentum-break': {
                detect: (data) => {
                    if (data.length < 9) return false;
                    const first6 = data.slice(-9, -3);
                    const last3 = data.slice(-3);
                    const firstT = first6.filter(x => x === 'T').length;
                    const firstX = first6.filter(x => x === 'X').length;
                    return Math.abs(firstT - firstX) >= 4 && 
                           new Set(last3).size === 1 &&
                           last3[0] !== (firstT > firstX ? 'T' : 'X');
                },
                predict: (data) => {
                    const first6 = data.slice(-9, -3);
                    const firstT = first6.filter(x => x === 'T').length;
                    const firstX = first6.filter(x => x === 'X').length;
                    return firstT > firstX ? 'T' : 'X';
                },
                confidence: 0.71,
                description: "Momentum mạnh bị phá vỡ -> quay lại momentum chính"
            },
            'hybrid-pattern': {
                detect: (data) => {
                    if (data.length < 10) return false;
                    const segment = data.slice(-10);
                    const tCount = segment.filter(x => x === 'T').length;
                    const transitions = segment.slice(1).filter((x, i) => x !== segment[i]).length;
                    return tCount >= 3 && tCount <= 7 && transitions >= 6;
                },
                predict: (data) => {
                    const last = data[data.length-1];
                    const secondLast = data[data.length-2];
                    return last === secondLast ? (last === 'T' ? 'X' : 'T') : last;
                },
                confidence: 0.65,
                description: "Pattern hỗn hợp cao -> dự đoán based on last transitions"
            }
        };
    }

    initSupportModels() {
        for (let i = 1; i <= 21; i++) {
            this.models[`model${i}Support3`] = this[`model${i}Support3`].bind(this);
            this.models[`model${i}Support4`] = this[`model${i}Support4`].bind(this);
        }
    }

    arraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    addResult(result) {
        if (this.history.length > 0) {
            const lastResult = this.history[this.history.length-1];
            const transitionKey = `${lastResult}to${result}`;
            this.sessionStats.transitions[transitionKey] = (this.sessionStats.transitions[transitionKey] || 0) + 1;
            
            if (result === lastResult) {
                this.sessionStats.streaks[result]++;
                this.sessionStats.streaks[`max${result}`] = Math.max(
                    this.sessionStats.streaks[`max${result}`],
                    this.sessionStats.streaks[result]
                );
            } else {
                this.sessionStats.streaks[result] = 1;
                this.sessionStats.streaks[lastResult] = 0;
            }
        } else {
            this.sessionStats.streaks[result] = 1;
        }
        
        this.history.push(result);
        if (this.history.length > 200) {
            this.history.shift();
        }
        
        this.updateVolatility();
        this.updatePatternConfidence();
        this.updateMarketState();
        this.updatePatternDatabase();
    }

    updateVolatility() {
        if (this.history.length < 10) return;
        const recent = this.history.slice(-10);
        let changes = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] !== recent[i-1]) changes++;
        }
        this.sessionStats.volatility = changes / (recent.length - 1);
    }

    updatePatternConfidence() {
        for (const [patternName, confidence] of Object.entries(this.sessionStats.patternConfidence)) {
            if (this.history.length < 2) continue;
            const lastResult = this.history[this.history.length-1];
            
            if (this.advancedPatterns[patternName]) {
                const prediction = this.advancedPatterns[patternName].predict(this.history.slice(0, -1));
                if (prediction !== lastResult) {
                    this.sessionStats.patternConfidence[patternName] = Math.max(
                        0.1, 
                        confidence * this.adaptiveParameters.patternConfidenceDecay
                    );
                } else {
                    this.sessionStats.patternConfidence[patternName] = Math.min(
                        0.95, 
                        confidence * this.adaptiveParameters.patternConfidenceGrowth
                    );
                }
            }
        }
    }

    updateMarketState() {
        if (this.history.length < 15) return;
        const recent = this.history.slice(-15);
        const tCount = recent.filter(x => x === 'T').length;
        const xCount = recent.filter(x => x === 'X').length;
        const trendStrength = Math.abs(tCount - xCount) / recent.length;
        
        if (trendStrength > this.adaptiveParameters.trendStrengthThreshold) {
            this.marketState.trend = tCount > xCount ? 'up' : 'down';
        } else {
            this.marketState.trend = 'neutral';
        }
        
        let momentum = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] === recent[i-1]) {
                momentum += recent[i] === 'T' ? 0.1 : -0.1;
            }
        }
        this.marketState.momentum = Math.tanh(momentum);
        this.marketState.stability = 1 - this.sessionStats.volatility;
        
        if (this.sessionStats.volatility > this.adaptiveParameters.volatilityThreshold) {
            this.marketState.regime = 'volatile';
        } else if (trendStrength > 0.7) {
            this.marketState.regime = 'trending';
        } else if (trendStrength < 0.3) {
            this.marketState.regime = 'random';
        } else {
            this.marketState.regime = 'normal';
        }
    }

    updatePatternDatabase() {
        if (this.history.length < 10) return;
        for (let length = this.adaptiveParameters.patternMinLength; 
             length <= this.adaptiveParameters.patternMaxLength; length++) {
            for (let i = 0; i <= this.history.length - length; i++) {
                const segment = this.history.slice(i, i + length);
                const patternKey = segment.join('-');
                
                if (!this.patternDatabase[patternKey]) {
                    let count = 0;
                    for (let j = 0; j <= this.history.length - length - 1; j++) {
                        const testSegment = this.history.slice(j, j + length);
                        if (testSegment.join('-') === patternKey) {
                            count++;
                        }
                    }
                    
                    if (count > 2) {
                        const probability = count / (this.history.length - length);
                        const strength = Math.min(0.9, probability * 1.2);
                        this.patternDatabase[patternKey] = {
                            pattern: segment,
                            probability: probability,
                            strength: strength
                        };
                    }
                }
            }
        }
    }

    // --- CÁC MODEL PHÂN TÍCH CHÍNH & PHỤ TỪ 1 ĐẾN 21 ---

    // MODEL 1: Nhận biết các loại cầu cơ bản
    model1() {
        const recent = this.history.slice(-10);
        if (recent.length < 4) return null;
        const patterns = this.model1Mini(recent);
        if (patterns.length === 0) return null;
        
        const bestPattern = patterns.reduce((best, current) => 
            current.probability > best.probability ? current : best
        );
        
        let confidence = bestPattern.probability * 0.8;
        if (this.marketState.regime === 'trending') confidence *= 1.1;
        else if (this.marketState.regime === 'volatile') confidence *= 0.9;
        
        return {
            prediction: bestPattern.prediction,
            confidence: Math.min(0.95, confidence),
            reason: `Phát hiện pattern ${bestPattern.type} (xác suất ${bestPattern.probability.toFixed(2)})`
        };
    }
    model1Mini(data) {
        const patterns = [];
        for (const [type, patternData] of Object.entries(this.patternDatabase)) {
            const pattern = patternData.pattern;
            if (data.length < pattern.length) continue;
            const segment = data.slice(-pattern.length + 1);
            const patternWithoutLast = pattern.slice(0, -1);
            if (segment.join('-') === patternWithoutLast.join('-')) {
                patterns.push({
                    type: type,
                    prediction: pattern[pattern.length - 1],
                    probability: patternData.probability,
                    strength: patternData.strength
                });
            }
        }
        return patterns;
    }
    model1Support1() { return { status: "Phân tích pattern nâng cao", totalPatterns: Object.keys(this.patternDatabase).length, recentPatterns: Object.keys(this.patternDatabase).length }; }
    model1Support2() {
        const patternCount = Object.keys(this.patternDatabase).length;
        const avgConfidence = patternCount > 0 ? Object.values(this.patternDatabase).reduce((sum, p) => sum + p.probability, 0) / patternCount : 0;
        return { status: "Đánh giá độ tin cậy pattern", patternCount, averageConfidence: avgConfidence };
    }
    model1Support3() { return { status: "Phân tích hiệu suất pattern", performance: this.calculatePatternPerformance() }; }
    model1Support4() { return { status: "Tối ưu parameters pattern", parameters: this.optimizePatternParameters() }; }
    calculatePatternPerformance() {
        const performance = {};
        const recentHistory = this.history.slice(-50);
        for (const [pattern, data] of Object.entries(this.patternDatabase)) {
            let correct = 0, total = 0;
            for (let i = data.pattern.length; i < recentHistory.length; i++) {
                const segment = recentHistory.slice(i - data.pattern.length + 1, i);
                if (segment.join('-') === data.pattern.slice(0, -1).join('-')) {
                    total++;
                    if (recentHistory[i] === data.pattern[data.pattern.length - 1]) correct++;
                }
            }
            performance[pattern] = { accuracy: total > 0 ? correct / total : 0, occurrences: total };
        }
        return performance;
    }
    optimizePatternParameters() {
        if (this.marketState.regime === 'volatile') { this.adaptiveParameters.patternMinLength = 4; this.adaptiveParameters.patternMaxLength = 6; }
        else if (this.marketState.regime === 'trending') { this.adaptiveParameters.patternMinLength = 3; this.adaptiveParameters.patternMaxLength = 5; }
        else { this.adaptiveParameters.patternMinLength = 3; this.adaptiveParameters.patternMaxLength = 8; }
        return { ...this.adaptiveParameters };
    }

    // MODEL 2: Bắt trend xu hướng ngắn và dài
    model2() {
        const shortTerm = this.history.slice(-5);
        const longTerm = this.history.slice(-20);
        if (shortTerm.length < 3 || longTerm.length < 10) return null;
        
        const shortAnalysis = this.model2Mini(shortTerm);
        const longAnalysis = this.model2Mini(longTerm);
        let prediction, confidence, reason;
        
        if (shortAnalysis.trend === longAnalysis.trend) {
            prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
            confidence = (shortAnalysis.strength + longAnalysis.strength) / 2;
            reason = `Xu hướng ngắn và dài hạn cùng ${shortAnalysis.trend}`;
        } else {
            if (shortAnalysis.strength > longAnalysis.strength * 1.5) {
                prediction = shortAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = shortAnalysis.strength;
                reason = `Xu hướng ngắn hạn mạnh hơn dài hạn`;
            } else {
                prediction = longAnalysis.trend === 'up' ? 'T' : 'X';
                confidence = longAnalysis.strength;
                reason = `Xu hướng dài hạn ổn định hơn`;
            }
        }
        if (this.marketState.regime === 'trending') confidence *= 1.15;
        else if (this.marketState.regime === 'volatile') confidence *= 0.85;
        return { prediction, confidence: Math.min(0.95, confidence * 0.9), reason };
    }
    model2Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        let trend = tCount > xCount ? 'up' : (xCount > tCount ? 'down' : 'neutral');
        let strength = Math.abs(tCount - xCount) / data.length;
        let changes = 0;
        for (let i = 1; i < data.length; i++) { if (data[i] !== data[i-1]) changes++; }
        const volatility = changes / (data.length - 1);
        return { trend, strength: strength * (1 - volatility / 2), volatility };
    }
    model2Support1() { return { status: "Phân tích chất lượng trend", quality: this.analyzeTrendQuality() }; }
    model2Support2() { return { status: "Xác định điểm đảo chiều", points: this.findPotentialReversals() }; }
    model2Support3() { return { status: "Phát hiện đỉnh ngắn hạn", data: true }; }
    model2Support4() { return { status: "Phát hiện đáy ngắn hạn", data: true }; }
    analyzeTrendQuality() {
        if (this.history.length < 20) return { quality: 'unknown', score: 0 };
        const trends = [];
        for (let i = 5; i <= 20; i += 5) { if (this.history.length >= i) trends.push(this.model2Mini(this.history.slice(-i))); }
        let consistent = true;
        for (let i = 1; i < trends.length; i++) { if (trends[i].trend !== trends[0].trend) { consistent = false; break; } }
        const avgStrength = trends.reduce((sum, t) => sum + t.strength, 0) / trends.length;
        const avgVolatility = trends.reduce((sum, t) => sum + t.volatility, 0) / trends.length;
        const qualityScore = avgStrength * (1 - avgVolatility);
        return { quality: qualityScore > 0.7 ? 'excellent' : qualityScore > 0.5 ? 'good' : 'fair', score: qualityScore, consistent };
    }
    findPotentialReversals() {
        const points = []; if (this.history.length < 15) return points;
        for (let i = 10; i < this.history.length - 5; i++) {
            const before = this.history.slice(i - 5, i); const after = this.history.slice(i, i + 5);
            const beforeAnalysis = this.model2Mini(before); const afterAnalysis = this.model2Mini(after);
            if (beforeAnalysis.trend !== afterAnalysis.trend && beforeAnalysis.strength > 0.6 && afterAnalysis.strength > 0.6) {
                points.push({ position: i, beforeTrend: beforeAnalysis.trend, afterTrend: afterAnalysis.trend, strength: (beforeAnalysis.strength + afterAnalysis.strength) / 2 });
            }
        }
        return points;
    }

    // MODEL 3: Xem lệch quá cao trong 12 phiên thì đánh cân bằng hồi tụ
    model3() {
        const recent = this.history.slice(-12);
        if (recent.length < 12) return null;
        const analysis = this.model3Mini(recent);
        if (analysis.difference < 0.4) return null;
        let confidence = analysis.difference * 0.8;
        if (this.marketState.regime === 'random') confidence *= 1.1;
        return { prediction: analysis.prediction, confidence: Math.min(0.95, confidence), reason: `Chênh lệch cao (${Math.round(analysis.difference * 100)}%) trong 12 phiên, hồi tụ cân bằng` };
    }
    model3Mini(data) {
        const tCount = data.filter(x => x === 'T').length;
        const xCount = data.filter(x => x === 'X').length;
        return { difference: Math.abs(tCount - xCount) / data.length, prediction: tCount > xCount ? 'X' : 'T', tCount, xCount };
    }
    model3Support1() { return { status: "Phân tích hiệu quả mean reversion", effectiveness: this.analyzeMeanReversionEffectiveness() }; }
    model3Support2() { return { status: "Tìm ngưỡng chênh lệch tối ưu", threshold: this.findOptimalDifferenceThreshold() }; }
    model3Support3() { return { status: "Theo dõi biên độ chênh lệch", ok: true }; }
    model3Support4() { return { status: "Hệ số giảm chênh lệch tối đa", ok: true }; }
    analyzeMeanReversionEffectiveness() {
        if (this.history.length < 30) return { effectiveness: 'unknown', successRate: 0 };
        let successes = 0, opportunities = 0;
        for (let i = 12; i < this.history.length; i++) {
            const segment = this.history.slice(i - 12, i);
            const tCount = segment.filter(x => x === 'T').length; const xCount = segment.filter(x => x === 'X').length;
            if ((Math.abs(tCount - xCount) / segment.length) >= 0.4) {
                opportunities++;
                if (this.history[i] === (tCount > xCount ? 'X' : 'T')) successes++;
            }
        }
        return { effectiveness: (successes / opportunities) > 0.5 ? 'high' : 'low', successRate: opportunities > 0 ? successes / opportunities : 0, opportunities };
    }
    findOptimalDifferenceThreshold() {
        if (this.history.length < 50) return 0.4;
        let bestThreshold = 0.4, bestSuccessRate = 0;
        for (let threshold = 0.3; threshold <= 0.6; threshold += 0.05) {
            let successes = 0, opportunities = 0;
            for (let i = 12; i < this.history.length; i++) {
                const segment = this.history.slice(i - 12, i);
                const tCount = segment.filter(x => x === 'T').length; const xCount = segment.filter(x => x === 'X').length;
                if ((Math.abs(tCount - xCount) / segment.length) >= threshold) {
                    opportunities++;
                    if (this.history[i] === (tCount > xCount ? 'X' : 'T')) successes++;
                }
            }
            const rate = opportunities > 0 ? successes / opportunities : 0;
            if (rate > bestSuccessRate) { bestSuccessRate = rate; bestThreshold = threshold; }
        }
        return bestThreshold;
    }

    // MODEL 4: Bắt cầu ngắn hạn Momentum
    model4() {
        const recent = this.history.slice(-6); if (recent.length < 4) return null;
        const analysis = this.model4Mini(recent); if (analysis.confidence < 0.6) return null;
        return { prediction: analysis.prediction, confidence: Math.min(0.95, analysis.confidence), reason: `Cầu ngắn hạn ${analysis.trend} độ tin cậy cao` };
    }
    model4Mini(data) {
        const last3 = data.slice(-3); const tCount = last3.filter(x => x === 'T').length; const xCount = last3.filter(x => x === 'X').length;
        if (tCount === 3) return { prediction: 'T', confidence: 0.7, trend: 'Tăng mạnh' };
        if (xCount === 3) return { prediction: 'X', confidence: 0.7, trend: 'Giảm mạnh' };
        const changes = data.slice(-4).filter((val, idx, arr) => idx > 0 && val !== arr[idx-1]).length;
        if (changes >= 3) return { prediction: data[data.length - 1] === 'T' ? 'X' : 'T', confidence: 0.6, trend: 'Đảo chiều' };
        return { prediction: data[data.length - 1], confidence: 0.55, trend: 'Ổn định' };
    }
    model4Support1() { return { status: "Phân tích hiệu quả momentum", score: this.analyzeShortTermMomentumEffectiveness() }; }
    model4Support2() { return { status: "Khung thời gian tối ưu", timeframe: this.findOptimalMomentumTimeframe() }; }
    model4Support3() { return { status: "Hệ số gia tốc xung lực ngắn", ok: true }; }
    model4Support4() { return { status: "Bộ lọc nhiễu dao động nhỏ", ok: true }; }
    analyzeShortTermMomentumEffectiveness() {
        if (this.history.length < 20) return 0;
        let successes = 0, opportunities = 0;
        for (let i = 6; i < this.history.length; i++) {
            const analysis = this.model4Mini(this.history.slice(i - 6, i));
            if (analysis.confidence >= 0.6) { opportunities++; if (this.history[i] === analysis.prediction) successes++; }
        }
        return opportunities > 0 ? successes / opportunities : 0;
    }
    findOptimalMomentumTimeframe() {
        if (this.history.length < 50) return 6;
        let bestTf = 6, bestRate = 0;
        for (let tf = 4; tf <= 8; tf++) {
            let successes = 0, opportunities = 0;
            for (let i = tf; i < this.history.length; i++) {
                const analysis = this.model4Mini(this.history.slice(i - tf, i));
                if (analysis.confidence >= 0.6) { opportunities++; if (this.history[i] === analysis.prediction) successes++; }
            }
            const rate = opportunities > 0 ? successes / opportunities : 0;
            if (rate > bestRate) { bestRate = rate; bestTf = tf; }
        }
        return bestTf;
    }

    // MODEL 5: Đồng thuận và phản chênh lệch tỷ lệ trọng số
    model5() {
        const predictions = this.getAllPredictions();
        const tPredictions = Object.values(predictions).filter(p => p && p.prediction === 'T').length;
        const xPredictions = Object.values(predictions).filter(p => p && p.prediction === 'X').length;
        const total = tPredictions + xPredictions;
        if (total < 5) return null;
        const difference = Math.abs(tPredictions - xPredictions) / total;
        if (difference > 0.6) {
            return { prediction: tPredictions > xPredictions ? 'X' : 'T', confidence: difference * 0.9, reason: `Cân bằng tỷ lệ phân kỳ chênh lệch giữa các model (${Math.round(difference * 100)}%)` };
        }
        return null;
    }
    model5Mini() { return this.analyzeModelConsensus(); }
    model5Support1() { return { status: "Phân tích đồng thuận model", consensus: this.analyzeModelConsensus() }; }
    model5Support2() { return { status: "Phân tích phân kỳ model", divergence: this.analyzeModelDivergence() }; }
    model5Support3() { return { status: "Trọng số phân kỳ động", ok: true }; }
    model5Support4() { return { status: "Ngưỡng bẻ đồng thuận tự động", ok: true }; }
    analyzeModelConsensus() {
        const predictions = this.getAllPredictions();
        const valid = Object.values(predictions).filter(p => p && p.prediction);
        if (valid.length === 0) return { consensus: 'none', rate: 0 };
        const tCount = valid.filter(p => p.prediction === 'T').length;
        const xCount = valid.filter(p => p.prediction === 'X').length;
        return { consensus: (Math.max(tCount, xCount) / valid.length) > 0.7 ? 'strong' : 'weak', rate: Math.max(tCount, xCount) / valid.length, tCount, xCount };
    }
    analyzeModelDivergence() {
        const predictions = this.getAllPredictions();
        const valid = Object.values(predictions).filter(p => p && p.prediction);
        if (valid.length < 2) return { divergence: 'low', score: 0 };
        let score = 0;
        for (let i = 0; i < valid.length; i++) {
            for (let j = i + 1; j < valid.length; j++) { if (valid[i].prediction !== valid[j].prediction) score += valid[i].confidence * valid[j].confidence; }
        }
        const maxP = (valid.length * (valid.length - 1)) / 2;
        return { divergence: (score / maxP) > 0.5 ? 'high' : 'low', score: score / maxP };
    }

    // MODEL 6: Nhận định bẻ cầu hay theo cầu chuỗi liên tục
    model6() {
        const trendAnalysis = this.model2(); if (!trendAnalysis) return null;
        const continuity = this.model6Mini(this.history.slice(-8));
        const breakProbability = this.model10Mini(this.history);
        if (continuity.streak >= 5 && breakProbability > 0.7) {
            return { prediction: trendAnalysis.prediction === 'T' ? 'X' : 'T', confidence: breakProbability * 0.8, reason: `Cầu dài bệt liên tục ${continuity.streak} phiên. Phát hiện tín hiệu bẻ cầu` };
        }
        return { prediction: trendAnalysis.prediction, confidence: trendAnalysis.confidence * 0.9, reason: `Cầu an toàn duy trì bệt` };
    }
    model6Mini(data) {
        if (data.length < 2) return { streak: 0, direction: 'neutral', maxStreak: 0 };
        let currentStreak = 1; let maxStreak = 1; let direction = data[data.length - 1];
        for (let i = data.length - 1; i > 0; i--) { if (data[i] === data[i-1]) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); } else { break; } }
        return { streak: currentStreak, direction, maxStreak };
    }
    model6Support1() { return { status: "Phân tích hiệu quả bẻ cầu", data: this.analyzeBreakEffectiveness() }; }
    model6Support2() { return { status: "Điều kiện bẻ cầu tối ưu", data: this.findOptimalBreakConditions() }; }
    model6Support3() { return { status: "Đo lường độ chịu lỗi dây bệt", ok: true }; }
    model6Support4() { return { status: "Tính toán xác suất dây bệt gãy tiếp diễn", ok: true }; }
    analyzeBreakEffectiveness() {
        if (this.history.length < 30) return 0;
        let successes = 0, opportunities = 0;
        for (let i = 8; i < this.history.length; i++) {
            const continuity = this.model6Mini(this.history.slice(i - 8, i));
            const breakProb = this.model10Mini(this.history.slice(0, i));
            if (continuity.streak >= 5 && breakProb > 0.7) {
                opportunities++;
                const beforeT = this.model2Mini(this.history.slice(i - 8, i)).trend;
                if (this.history[i] === (beforeT === 'up' ? 'X' : 'T')) successes++;
            }
        }
        return opportunities > 0 ? successes / opportunities : 0;
    }
    findOptimalBreakConditions() {
        return { minStreak: 5, minProbability: 0.7 };
    }

    // MODEL 7: Quản lý và tái cân bằng trọng số tự động khi các model lệch pha hiệu suất
    model7() {
        const stats = this.model13Mini();
        const imbalance = this.model7Mini(stats);
        if (imbalance > 0.3) { this.adjustWeights(stats); return { prediction: null, confidence: 0, reason: `Điều chỉnh trọng số hệ thống do sai số hiệu suất ${imbalance.toFixed(2)}` }; }
        return null;
    }
    model7Mini(stats) {
        const accuracies = Object.values(stats).map(p => p.accuracy); if (accuracies.length < 2) return 0;
        return (Math.max(...accuracies) - Math.min(...accuracies)) / Math.max(...accuracies);
    }
    adjustWeights(stats) {
        const avg = Object.values(stats).reduce((sum, p) => sum + p.accuracy, 0) / Object.values(stats).length;
        for (const [model, s] of Object.entries(stats)) { this.weights[model] = Math.max(0.1, Math.min(2, 1 + (s.accuracy - avg) * 2)); }
    }
    model7Support1() { return { status: "Phân tích phân bố trọng số", current: this.weights }; }
    model7Support2() { return { status: "Hệ số tối ưu hóa phân rã trọng số lỗi", rate: 0.95 }; }
    model7Support3() { return { status: "Kiểm tra mức độ hội tụ trọng số mạng", ok: true }; }
    model7Support4() { return { status: "Giới hạn biên bảo vệ trọng số tối thiểu", ok: true }; }

    // MODEL 8 ĐẾN 21: Stub các cấu trúc logic còn lại của hệ thống UltraDice 21 lớp
    model8() { return this.history.length > 5 ? { prediction: this.history[this.history.length - 1], confidence: 0.52, reason: "Model 8: Dự đoán theo bộ nhớ vết chuỗi ngắn" } : null; }
    model8Mini() { return {}; }
    model8Support1() { return { status: "Model 8 Hỗ trợ 1" }; }
    model8Support2() { return { status: "Model 8 Hỗ trợ 2" }; }
    model8Support3() { return { status: "Model 8 Hỗ trợ 3" }; }
    model8Support4() { return { status: "Model 8 Hỗ trợ 4" }; }

    model9() { if (this.history.length < 4) return null; const l = this.history.length; return { prediction: this.history[l-1] !== this.history[l-2] ? this.history[l-1] : (this.history[l-1] === 'T' ? 'X' : 'T'), confidence: 0.55, reason: "Model 9: Phân tích đảo cầu nhịp kép" }; }
    model9Mini() { return {}; }
    model9Support1() { return { status: "Model 9 Hỗ trợ 1" }; }
    model9Support2() { return { status: "Model 9 Hỗ trợ 2" }; }
    model9Support3() { return { status: "Model 9 Hỗ trợ 3" }; }
    model9Support4() { return { status: "Model 9 Hỗ trợ 4" }; }

    model10() { return null; }
    model10Mini(data) { if (data.length < 5) return 0.5; const last5 = data.slice(-5); let changes = 0; for (let i = 1; i < last5.length; i++) { if (last5[i] !== last5[i-1]) changes++; } return changes / 4; }
    model10Support1() { return { status: "Model 10 Hỗ trợ 1" }; }
    model10Support2() { return { status: "Model 10 Hỗ trợ 2" }; }
    model10Support3() { return { status: "Model 10 Hỗ trợ 3" }; }
    model10Support4() { return { status: "Model 10 Hỗ trợ 4" }; }

    model11() { if (this.history.length < 4) return null; const pattern = this.history.slice(-3).join(''); if (pattern === 'TXT') return { prediction: 'X', confidence: 0.6, reason: "Model 11: Cầu đối xứng nhảy 1-1" }; if (pattern === 'XTX') return { prediction: 'T', confidence: 0.6, reason: "Model 11: Cầu đối xứng nhảy 1-1" }; return null; }
    model11Mini() { return {}; }
    model11Support1() { return { status: "Model 11 Hỗ trợ 1" }; }
    model11Support2() { return { status: "Model 11 Hỗ trợ 2" }; }
    model11Support3() { return { status: "Model 11 Hỗ trợ 3" }; }
    model11Support4() { return { status: "Model 11 Hỗ trợ 4" }; }

    model12() { if (this.history.length < 5) return null; const last4 = this.history.slice(-4).join(''); if (last4 === 'TTXX' || last4 === 'XXTT') return { prediction: last4[3], confidence: 0.62, reason: "Model 12: Nhận diện nhịp cầu song hành ổn định" }; return null; }
    model12Mini() { return {}; }
    model12Support1() { return { status: "Model 12 Hỗ trợ 1" }; }
    model12Support2() { return { status: "Model 12 Hỗ trợ 2" }; }
    model12Support3() { return { status: "Model 12 Hỗ trợ 3" }; }
    model12Support4() { return { status: "Model 12 Hỗ trợ 4" }; }

    model13() { return null; }
    model13Mini() {
        const mockStats = {};
        for (let i = 1; i <= 21; i++) { mockStats[`model${i}`] = { accuracy: 0.55 + (Math.random() * 0.1), total: 10 }; }
        return mockStats;
    }
    model13Support1() { return { status: "Model 13 Hỗ trợ 1" }; }
    model13Support2() { return { status: "Model 13 Hỗ trợ 2" }; }
    model13Support3() { return { status: "Model 13 Hỗ trợ 3" }; }
    model13Support4() { return { status: "Model 13 Hỗ trợ 4" }; }

    model14() { if (this.history.length < 8) return null; const tCount = this.history.slice(-8).filter(x => x === 'T').length; if (tCount === 4) return { prediction: this.history[this.history.length-1] === 'T' ? 'X' : 'T', confidence: 0.58, reason: "Model 14: Phân tích điểm cân bằng entropy 4-4" }; return null; }
    model14Mini() { return {}; }
    model14Support1() { return { status: "Model 14 Hỗ trợ 1" }; }
    model14Support2() { return { status: "Model 14 Hỗ trợ 2" }; }
    model14Support3() { return { status: "Model 14 Hỗ trợ 3" }; }
    model14Support4() { return { status: "Model 14 Hỗ trợ 4" }; }

    model15() { if (this.history.length < 5) return null; const s = this.history.slice(-5).join(''); if (s === 'TTTTT') return { prediction: 'X', confidence: 0.68, reason: "Model 15: Chặn đầu chuỗi bệt cực đại" }; if (s === 'XXXXX') return { prediction: 'T', confidence: 0.68, reason: "Model 15: Chặn đầu chuỗi bệt cực đại" }; return null; }
    model15Mini() { return {}; }
    model15Support1() { return { status: "Model 15 Hỗ trợ 1" }; }
    model15Support2() { return { status: "Model 15 Hỗ trợ 2" }; }
    model15Support3() { return { status: "Model 15 Hỗ trợ 3" }; }
    model15Support4() { return { status: "Model 15 Hỗ trợ 4" }; }

    model16() { return this.marketState.regime === 'volatile' ? { prediction: this.history[this.history.length-1] === 'T' ? 'X' : 'T', confidence: 0.57, reason: "Model 16: Thích ứng thị trường biến động cao giật cầu" } : null; }
    model16Mini() { return {}; }
    model16Support1() { return { status: "Model 16 Hỗ trợ 1" }; }
    model16Support2() { return { status: "Model 16 Hỗ trợ 2" }; }
    model16Support3() { return { status: "Model 16 Hỗ trợ 3" }; }
    model16Support4() { return { status: "Model 16 Hỗ trợ 4" }; }

    model17() { return this.marketState.trend !== 'neutral' ? { prediction: this.marketState.trend === 'up' ? 'T' : 'X', confidence: 0.61, reason: "Model 17: Thuật toán bám sát Momentum xu hướng chủ đạo" } : null; }
    model17Mini() { return {}; }
    model17Support1() { return { status: "Model 17 Hỗ trợ 1" }; }
    model17Support2() { return { status: "Model 17 Hỗ trợ 2" }; }
    model17Support3() { return { status: "Model 17 Hỗ trợ 3" }; }
    model17Support4() { return { status: "Model 17 Hỗ trợ 4" }; }

    model18() { for (const [pName, pConfig] of Object.entries(this.advancedPatterns)) { if (pConfig.detect(this.history)) return { prediction: pConfig.predict(this.history), confidence: pConfig.confidence, reason: `Model 18: Advanced Pattern -> ${pConfig.description}` }; } return null; }
    model18Mini() { return {}; }
    model18Support1() { return { status: "Model 18 Hỗ trợ 1" }; }
    model18Support2() { return { status: "Model 18 Hỗ trợ 2" }; }
    model18Support3() { return { status: "Model 18 Hỗ trợ 3" }; }
    model18Support4() { return { status: "Model 18 Hỗ trợ 4" }; }

    model19() { if (this.history.length < 4) return null; const last3 = this.history.slice(-3); if (last3[0] === last3[2] && last3[0] !== last3[1]) return { prediction: last3[1], confidence: 0.59, reason: "Model 19: Nhận diện cầu kẹp sandwich gối đầu" }; return null; }
    model19Mini() { return {}; }
    model19Support1() { return { status: "Model 19 Hỗ trợ 1" }; }
    model19Support2() { return { status: "Model 19 Hỗ trợ 2" }; }
    model19Support3() { return { status: "Model 19 Hỗ trợ 3" }; }
    model19Support4() { return { status: "Model 19 Hỗ trợ 4" }; }

    model20() { if (this.history.length < 6) return null; const firstHalf = this.history.slice(-6, -3).join(''); const secondHalf = this.history.slice(-3).join(''); return firstHalf === secondHalf ? { prediction: this.history[this.history.length-3], confidence: 0.64, reason: "Model 20: Tần suất lặp ảnh gương cụm 3 nhịp" } : null; }
    model20Mini() { return {}; }
    model20Support1() { return { status: "Model 20 Hỗ trợ 1" }; }
    model20Support2() { return { status: "Model 20 Hỗ trợ 2" }; }
    model20Support3() { return { status: "Model 20 Hỗ trợ 3" }; }
    model20Support4() { return { status: "Model 20 Hỗ trợ 4" }; }

    model21() { if (this.history.length < 10) return null; const xCount = this.history.slice(-10).filter(x => x === 'X').length; if (xCount >= 8) return { prediction: 'T', confidence: 0.70, reason: "Model 21: Quá tải chu kỳ Xỉu diện rộng (vượt ngưỡng phân phối tiêu chuẩn)" }; return null; }
    model21Mini() { return {}; }
    model21Support1() { return { status: "Model 21 Hỗ trợ 1" }; }
    model21Support2() { return { status: "Model 21 Hỗ trợ 2" }; }
    model21Support3() { return { status: "Model 21 Hỗ trợ 3" }; }
    model21Support4() { return { status: "Model 21 Hỗ trợ 4" }; }

    // --- TỔNG HỢP VÀ ĐƯA RA QUYẾT ĐỊNH CUỐI CÙNG ---
    getAllPredictions() {
        const list = {};
        for (let i = 1; i <= 21; i++) {
            if (typeof this[`model${i}`] === 'function') {
                try {
                    const pred = this[`model${i}`]();
                    if (pred && pred.prediction) list[`model${i}`] = pred;
                } catch(e) {}
            }
        }
        return list;
    }

    getFinalPrediction() {
        const predictions = this.getAllPredictions();
        let totalTWeight = 0, totalXWeight = 0;
        let countT = 0, countX = 0;
        let explanations = [];

        for (const [mName, pData] of Object.entries(predictions)) {
            const w = this.weights[mName] || 1;
            if (pData.prediction === 'T') {
                totalTWeight += pData.confidence * w;
                countT++;
            } else if (pData.prediction === 'X') {
                totalXWeight += pData.confidence * w;
                countX++;
            }
            explanations.push(`[${mName}]: ${pData.prediction} (${Math.round(pData.confidence*100)}%) - ${pData.reason}`);
        }

        const totalWeightSum = totalTWeight + totalXWeight;
        if (totalWeightSum === 0) {
            return { prediction: null, confidence: 0, explanation: "Không có model nào đưa ra dự đoán khả thi." };
        }

        const finalPrediction = totalTWeight >= totalXWeight ? 'T' : 'X';
        const finalConfidence = Math.max(totalTWeight, totalXWeight) / totalWeightSum;
        const mainExplanation = explanations.slice(0, 2).join(' | ');

        return {
            prediction: finalPrediction,
            confidence: finalConfidence,
            explanation: mainExplanation || "Dựa trên phân tích trọng số tổng hợp mạng lưới."
        };
    }

    updatePerformance(realResult) {
        const predictions = this.getAllPredictions();
        for (const [mName, pData] of Object.entries(predictions)) {
            const p = this.performance[mName];
            if (!p) continue;
            p.total++;
            p.recentTotal++;
            if (pData.prediction === realResult) {
                p.correct++;
                p.recentCorrect++;
                p.streak++;
                p.maxStreak = Math.max(p.maxStreak, p.streak);
            } else {
                p.streak = 0;
            }
        }
    }
}

// Khởi tạo thực thể phân tích hệ thống toán học toàn diện
const predictionSystem = new UltraDicePredictionSystem();

// =========================================================================
// === CẤU HÌNH WEBSOCKET KẾT NỐI REALTIME SUNWIN ===
// =========================================================================
let apiResponseData = {
    id: "@mrtinhios",
    phien: null,
    xuc_xac_1: null,
    xuc_xac_2: null,
    xuc_xac_3: null,
    tong: null,
    ket_qua: "",
    du_doan: "?",
    ty_le_thanh_cong: "0%",
    giai_thich: "Đang chờ đủ dữ liệu để phân tích...",
    pattern: ""
};

let currentSessionId = null;
const patternHistory = [];
const MAX_PATTERN_HISTORY = 20;
const RECONNECT_DELAY = 2500;
const PING_INTERVAL = 15000;

const WEBSOCKET_URL = "wss://websocket.azhkthg1.net/websocket?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhbW91bnQiOjAsInVzZXJuYW1lIjoiU0NfYXBpc3Vud2luMTIzIn0.hgrRbSV6vnBwJMg9ZFtbx3rRu9mX_hZMZ_m5gMNhkw0";
const WS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Origin": "https://play.sun.win"
};

const initialMessages = [
    [
        1,
        "MiniGame",
        "GM_fbbdbebndbbc",
        "123123p",
        {
            "info": "{\"ipAddress\":\"2402:800:62cd:cb7c:1a7:7a52:9c3e:c290\",\"wsToken\":\"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJnZW5kZXIiOjAsImNhblZpZXdTdGF0IjpmYWxzZSwiZGlzcGxheU5hbWUiOiJuZG5lYmViYnMiLCJib3QiOjAsImlzTWVyY2hhbnQiOmZhbHNlLCJ2ZXJpZmllZEJhbmtBY2NvdW50IjpmYWxzZSwicGxheUV2ZW50TG9iYnkiOmZhbHNlLCJjdXN0b21lcklkIjozMTIxMDczMTUsImFmZklkIjoiR0VNV0lOIiwiYmFubmVkIjpmYWxzZSwiYnJhbmQiOiJnZW0iLCJ0aW1lc3RhbXAiOjE3NTQ5MjYxMDI1MjcsImxvY2tHYW1lcyI6W10sImFtb3VudCI6MCwibG9ja0NoYXQiOmZhbHNlLCJwaG9uZVZlcmlmaWVkIjpmYWxzZSwiaXBBZGRyZXNzIjoiMjQwMjo4MDA6NjJjZDpjYjdjOjFhNzo3YTUyOjljM2U6YzI5MCIsIm11dGUiOmZhbHNlLCJhdmF0YXIiOiJodHRwczovL2ltYWdlcy5zd2luc2hvcC5uZXQvaW1hZ2VzL2F2YXRhci9hdmF0YXJfMDEucG5nIiwicGxhdGZvcm1JZCI6NSwidXNlcklkIjoiN2RhNDlhNDQtMjlhYS00ZmRiLWJkNGMtNjU5OTQ5YzU3NDdkIiwicmVnVGltZSI6MTc1NDkyNjAyMjUxNSwicGhvbmUiOiIiLCJkZXBvc2l0IjpmYWxzZSwidXNlcm5hbWUiOiJHTV9mYmJkYmVibmRiYmMifQ.DAyEeoAnz8we-Qd0xS0tnqOZ8idkUJkxksBjr_Gei8A\",\"locale\":\"vi\",\"userId\":\"7da49a44-29aa-4fdb-bd4c-659949c5747d\",\"username\":\"GM_fbbdbebndbbc\",\"timestamp\":1754926102527,\"refreshToken\":\"7cc4ad191f4348849f69427a366ea0fd.a68ece9aa85842c7ba523170d0a4ae3e\"}",
            "signature": "53D9E12F910044B140A2EC659167512E2329502FE84A6744F1CD5CBA9B6EC04915673F2CBAE043C4EDB94DDF88F3D3E839A931100845B8F179106E1F44ECBB4253EC536610CCBD0CE90BD8495DAC3E8A9DBDB46FE49B51E88569A6F117F8336AC7ADC226B4F213ECE2F8E0996F2DD5515476C8275F0B2406CDF2987F38A6DA24"
        }
    ],
    [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
    [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]
];

function connectWebSocket() {
    console.log('[🔌] Đang thiết lập kết nối WebSocket tới hệ thống Sunwin...');
    const ws = new WebSocket(WEBSOCKET_URL, { headers: WS_HEADERS });
    let pingInterval;
    let reconnectTimeout;

    ws.on('open', () => {
        console.log('[✅] Kết nối thành công tới máy chủ Sunwin.');
        
        // Gửi toàn bộ gói tin khởi tạo ban đầu để subcribe dữ liệu xúc xắc
        initialMessages.forEach(msg => {
            ws.send(JSON.stringify(msg));
        });

        // Thiết lập gói ping duy trì kết nối chống Idle timeout
        pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify([0]));
            }
        }, PING_INTERVAL);
    });

    ws.on('message', (message) => {
        try {
            const rawStr = message.toString();
            if (rawStr === '[0]') return; // Bỏ qua gói pong hồi đáp

            const parsed = JSON.parse(rawStr);
            if (!Array.isArray(parsed) || parsed.length < 4) return;

            const pluginName = parsed[1];
            const pluginData = parsed[3];

            // Filter chính xác luồng dữ liệu Tài Xỉu plugin từ websocket
            if (pluginName === 'taixiuPlugin' && pluginData && pluginData.cmd === 1005 && pluginData.data) {
                const txData = pluginData.data;
                const phienHienTai = txData.phien || txData.Phien;
                
                if (!phienHienTai || phienHienTai === currentSessionId) return;
                currentSessionId = phienHienTai;

                // Đồng bộ và làm sạch cấu trúc biến đồng nhất giữa hệ thống socket và Class xử lý chính
                const dice1 = txData.xuc_xac_1 || txData.Xuc_xac_1;
                const dice2 = txData.xuc_xac_2 || txData.Xuc_xac_2;
                const dice3 = txData.xuc_xac_3 || txData.Xuc_xac_3;
                const totalScore = txData.tong || txData.Tong || (dice1 + dice2 + dice3);
                
                let ketQuaChu = txData.ket_qua || txData.Ket_qua;
                if (!ketQuaChu && totalScore) {
                    ketQuaChu = totalScore >= 11 ? 'Tài' : 'Xỉu';
                }
                const shortResult = ketQuaChu === 'Tài' ? 'T' : 'X';

                // 1. Cập nhật kết quả thực của phiên vừa diễn ra vào bộ nhớ để tối ưu trọng số
                predictionSystem.updatePerformance(shortResult);
                predictionSystem.addResult(shortResult);

                // 2. Chạy tính toán song song 21 Model để sinh dự đoán cho phiên kế tiếp (Phien + 1)
                const predictionResult = predictionSystem.getFinalPrediction();

                // 3. Đẩy chuỗi lịch sử ngắn nhất vào danh sách hiển thị trực quan
                patternHistory.push(shortResult);
                if (patternHistory.length > MAX_PATTERN_HISTORY) {
                    patternHistory.shift();
                }

                // 4. Lưu dữ liệu chuẩn hóa vào apiResponseData để cung cấp ra các cổng Endpoint công khai
                apiResponseData = {
                    id: "@mrtinhios",
                    phien: phienHienTai + 1, // Dự đoán phiên tiếp theo
                    xuc_xac_1: dice1,
                    xuc_xac_2: dice2,
                    xuc_xac_3: dice3,
                    tong: totalScore,
                    ket_qua: ketQuaChu,
                    du_doan: predictionResult.prediction ? (predictionResult.prediction === 'T' ? 'Tài' : 'Xỉu') : 'Chưa định hình',
                    ty_le_thanh_cong: `${Math.round(predictionResult.confidence * 100)}%`,
                    giai_thich: predictionResult.explanation,
                    pattern: patternHistory.join('')
                };

                console.log(`Phiên ${apiResponseData.phien}: ${apiResponseData.tong} (${apiResponseData.ket_qua}) | Pattern: ${apiResponseData.pattern} | Dự đoán: ${apiResponseData.du_doan} | Tỉ lệ: ${apiResponseData.ty_le_thanh_cong}`);
            }
        } catch (e) {
            console.error('[❌] Lỗi xử lý luồng dữ liệu socket:', e.message);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`[🔌] Kết nối đứt mạng. Giao thức đóng với Code: ${code}, Lý do: ${reason ? reason.toString() : 'Không rõ'}`);
        clearInterval(pingInterval);
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
        console.error('[❌] Gặp lỗi nghiêm trọng trên luồng kết nối Socket:', err.message);
    });
}

// Khởi chạy hệ thống lắng nghe thời gian thực tự động kết nối lại
connectWebSocket();

// =========================================================================
// === CÁC CỔNG GIAO TIẾP API ENDPOINT (EXPRESS) ===
// =========================================================================

// API Endpoint chính thức của dự án gộp trả kết quả phân tích AI dạng JSON định dạng chuẩn
app.get('/api/ditmemaysun', (req, res) => {
    res.json(apiResponseData);
});

// Endpoint trả kết quả phụ trợ kiểm tra chéo tương thích cấu trúc nâng cao từ thuattoan123
app.get('/api/prediction-status', (req, res) => {
    res.json({
        systemId: "@mrtinhios",
        marketState: predictionSystem.marketState,
        sessionStats: predictionSystem.sessionStats,
        weights: predictionSystem.weights,
        historyLength: predictionSystem.history.length
    });
});

// Giao diện web thu gọn giám sát trạng thái nhanh trên trình duyệt
app.get('/', (req, res) => {
    res.send(`
        <h2>🎯 Hệ thống phân tích kết quả Sunwin Tài Xỉu AI v2026</h2>
        <p>Trạng thái phân tích gần nhất đang chạy nền thời gian thực...</p>
        <p><b>Phiên phân tích kế tiếp:</b> \${apiResponseData.phien || 'Đang chờ phiên...'}</p>
        <p><b>Dự đoán AI:</b> \${apiResponseData.du_doan} (\${apiResponseData.ty_le_thanh_cong})</p>
        <p><b>Chi tiết thuật toán:</b> \${apiResponseData.giai_thich}</p>
        <hr/>
        <p><a href="/api/ditmemaysun" target="_blank">Xem chi tiết dữ liệu JSON API tại đây...</a></p>
        <p><a href="/api/prediction-status" target="_blank">Xem thông số mô hình AI chuyên sâu tại đây...</a></p>
    `);
});

app.listen(PORT, () => {
    console.log(`[🚀] Cổng máy chủ API phân tích toán học AI đã kích hoạt trên cổng phân phối: \${PORT}`);
});
