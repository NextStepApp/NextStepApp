import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  Text,
  View,
  Button,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";

// ----- Categories -----
const phase1Categories = [
  "Shakes & Cereal",
  "Entrees",
  "Bars",
  "Fruits & Veggies",
  "Days Met 3+2+5",
  "Days In The Box",
  "Physical Activity",
  "Today's Weight",
];

const phase2Categories = [
  "Shakes & Cereal",
  "Entrees",
  "Bars",
  "Fruits & Veggies",
  "Days in Phase 1 Box",
  "Days In 1.5 Box",
  "Physical Activity",
  "Today's Weight",
];

// ----- Calorie chart (enter your full table here) -----
// Example rows; extend to match your Excel "Calories" sheet
const calorieChart = [
  { min: 100, max: 120.99, low: 1, medium: 3, high: 7, veryHigh: 10 },
  { min: 121, max: 140.99, low: 1, medium: 5, high: 9, veryHigh: 12 },
  { min: 141, max: 160.99, low: 2, medium: 5, high: 10, veryHigh: 13 },
  { min: 161, max: 180.99, low: 2, medium: 6, high: 11, veryHigh: 14 },
  { min: 181, max: 200.99, low: 2, medium: 7, high: 12, veryHigh: 15 },
  // ...continue all your ranges...
];

const intensities = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" }, // default
  { key: "high", label: "High" },
  { key: "veryHigh", label: "Very High" },
];

export default function App() {
  const [phase, setPhase] = useState(1);
  const [entries, setEntries] = useState({}); // { 'YYYY-MM-DD': { category: number } }
  const [showCalc, setShowCalc] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [intensity, setIntensity] = useState("medium");

  // Today and selected date (add swiping later)
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const categories = phase === 1 ? phase1Categories : phase2Categories;

  const getDayEntries = (date) => entries[date] || {};
  const getValue = (date, category) => getDayEntries(date)[category] ?? 0;

  const updateEntry = (date, category, value) => {
    setEntries((prev) => {
      const day = prev[date] || {};
      return { ...prev, [date]: { ...day, [category]: value } };
    });
  };

  const increment = (category) => {
    const val = getValue(today, category);
    updateEntry(today, category, val + 1);
  };
  const decrement = (category) => {
    const val = getValue(today, category);
    updateEntry(today, category, Math.max(0, val - 1));
  };

  // Most recent weight up to and including today
  const getMostRecentWeight = () => {
    const dates = Object.keys(entries).sort(); // ascending
    for (let i = dates.length - 1; i >= 0; i--) {
      const d = dates[i];
      const w = entries[d]?.["Today's Weight"];
      if (typeof w === "number" && !isNaN(w)) return w;
    }
    return null;
  };

  const getCaloriesPerMinute = (weight, intensityKey) => {
    const row = calorieChart.find((r) => weight >= r.min && weight <= r.max);
    if (!row) return 0;
    return row[intensityKey] ?? 0;
  };

  const handleCalculate = () => {
    const weight = getMostRecentWeight();
    if (!weight) {
      Alert.alert("Weight needed", "Please enter your weight first.");
      return;
    }
    const mins = Number(minutes);
    if (!mins || mins <= 0) {
      Alert.alert("Minutes needed", "Enter minutes of exercise.");
      return;
    }
    const calPerMin = getCaloriesPerMinute(weight, intensity);
    const totalCalories = Math.round(calPerMin * mins);
    const current = getValue(today, "Physical Activity");
    updateEntry(today, "Physical Activity", current + totalCalories);
    setShowCalc(false);
    setMinutes("");
    setIntensity("medium");
  };

  const renderCategory = ({ item }) => {
    const val = getValue(today, item);

    if (item === "Physical Activity") {
      return (
        <View style={styles.row}>
          <Text style={styles.label}>{item}:</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(val)}
            onChangeText={(t) => updateEntry(today, item, Number(t) || 0)}
          />
          <Text style={styles.unit}>cal</Text>
          <Button title="Calculate" onPress={() => setShowCalc(true)} />
        </View>
      );
    }

    if (item === "Today's Weight") {
      return (
        <View style={styles.row}>
          <Text style={styles.label}>{item}:</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={String(val)}
            onChangeText={(t) => updateEntry(today, item, Number(t) || 0)}
          />
          <Text style={styles.unit}>lbs</Text>
        </View>
      );
    }

    return (
      <View style={styles.row}>
        <Text style={styles.label}>{item}:</Text>
        <TouchableOpacity style={styles.button} onPress={() => decrement(item)}>
          <Text>-</Text>
        </TouchableOpacity>
        <Text style={styles.value}>{val}</Text>
        <TouchableOpacity style={styles.button} onPress={() => increment(item)}>
          <Text>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Next Step App</Text>
      <Button
        title={`Switch to Phase ${phase === 1 ? 2 : 1}`}
        onPress={() => setPhase(phase === 1 ? 2 : 1)}
      />

      <FlatList
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item}
      />

      {/* Calories Calculator */}
      <Modal visible={showCalc} animationType="slide" transparent>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Calories Calculator</Text>
          <Text>
            Most recent weight: {getMostRecentWeight() ?? "—"} lbs
          </Text>

          <Text style={{ marginTop: 10 }}>Select Intensity:</Text>
          {intensities.map((lvl) => (
            <TouchableOpacity
              key={lvl.key}
              style={[
                styles.intensityBtn,
                intensity === lvl.key && styles.selectedBtn,
              ]}
              onPress={() => setIntensity(lvl.key)}
            >
              <Text style={{ color: intensity === lvl.key ? "#fff" : "#000" }}>
                {lvl.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Minutes exercised"
            keyboardType="numeric"
            value={minutes}
            onChangeText={setMinutes}
          />

          <Button title="Add Calories" onPress={handleCalculate} />
          <View style={{ height: 6 }} />
          <Button title="Cancel" onPress={() => setShowCalc(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  label: { flex: 1, fontSize: 16 },
  value: { width: 40, textAlign: "center", fontSize: 16 },
  button: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  input: {
    borderWidth: 1,
    padding: 5,
    width: 100,
    textAlign: "center",
    borderRadius: 5,
    marginHorizontal: 5,
  },
  unit: { marginLeft: 5 },
  modal: {
    marginTop: "35%",
    backgroundColor: "#fff",
    padding: 20,
    marginHorizontal: 20,
    borderRadius: 10,
    elevation: 5,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  intensityBtn: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 5,
  },
  selectedBtn: { backgroundColor: "#007AFF" },
});
