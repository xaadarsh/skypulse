"""Writes RESULTS.md from the saved artifacts (so every number is a real run).  Run: python -m ml.make_results"""
import json
from ml.pipeline import ART, ROOT

m = json.load(open(ART / "metrics.json"))
seg = json.load(open(ART / "segments.json"))
fair = json.load(open(ART / "fairness.json"))
shap_g = json.load(open(ART / "shap_global.json"))
eda = json.load(open(ART / "eda.json"))

L = ["# SkyPulse — Final Results (Team 11)", "",
     f"Dataset: Kaggle Airline Passenger Satisfaction, {eda['rows']:,} passengers, 22 features. "
     f"Stratified 80/20 split (random_state={m['split']['random_state']}): {m['split']['train']:,} train / {m['split']['test']:,} test.",
     f"Overall satisfied rate: {eda['satisfied_rate']*100:.1f}%. Missing arrival delay values: {eda['missing_arrival_delay']} (filled with train median {eda['arrival_delay_train_median']:.0f}).", "",
     "## Model comparison (test set)", "",
     "| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | Fit time (s) | Tuning time (s) |", "|---|---|---|---|---|---|---|---|"]
rows = {**m["models"], "Booking-time XGBoost (6 features)": m["booking_model"]}
for k, v in rows.items():
    tag = " **(best F1)**" if k == m["best_model"] else " *(served in app)*" if k == m["served_model"] else ""
    L.append(f"| {k}{tag} | {v['accuracy']:.4f} | {v['precision']:.4f} | {v['recall']:.4f} | {v['f1']:.4f} | {v['roc_auc']:.4f} | {v['train_time_s']} | {v.get('tuning_time_s', '—')} |")
L += ["", "Notes:"] + [f"- **{k}:** {v['note']}" for k, v in rows.items() if v.get("note")]
L += [f"- **Served model ({m['served_model']}):** {m.get('serving_reason', '')}.", "",
      "## Best hyper-parameters (RandomizedSearchCV, 3-fold, scoring = F1)", ""]
L += [f"- {k}: `{v.get('best_params')}`" for k, v in m["models"].items()]
L += ["", "## Confusion matrices (rows actual, cols predicted; [[TN, FP], [FN, TP]])", ""]
L += [f"- {k}: {v['confusion_matrix']}" for k, v in rows.items()]
L += ["", f"## Top 10 features by mean |SHAP| ({m['served_model']})", "", "| Rank | Feature | Mean abs SHAP |", "|---|---|---|"]
L += [f"| {i+1} | {r['label']} | {r['importance']:.4f} |" for i, r in enumerate(shap_g[:10])]
L += ["", f"## Passenger segments (K-Means, k = {seg['k']}, silhouette {seg['silhouette']})", "",
      "| # | Segment | Share | Satisfied | Avg age | Avg distance |", "|---|---|---|---|---|---|"]
L += [f"| {s['id']} | {s['name']} | {s['share']*100:.1f}% | {s['satisfied_rate']*100:.1f}% | {s['avg_age']:.0f} | {s['avg_distance']:.0f} mi |" for s in seg["segments"]]
L += ["", f"## Fairness ({m['served_model']}, test set)", "", "| Attribute | Group | n | Accuracy | F1 |", "|---|---|---|---|---|"]
L += [f"| {r['attribute']} | {r['group']} | {r['n']:,} | {r['accuracy']:.4f} | {r['f1']:.4f} |" for r in fair]
L += ["", "## Satisfaction by departure delay (whole dataset)", "", "| Delay (min) | Passengers | Satisfied |", "|---|---|---|"]
L += [f"| {r['group']} | {r['n']:,} | {r['satisfied_rate']*100:.1f}% |" for r in eda["by_delay"]]
L += ["", "Recovery action costs in the app are assumed values (configurable in `backend/engine.py`)."]
(ROOT / "RESULTS.md").write_text("\n".join(L) + "\n", encoding="utf-8")
print("written RESULTS.md")
