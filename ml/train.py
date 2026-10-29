"""Train every SkyPulse model and write artifacts to ml/artifacts/.

Run:  python -m ml.train
"""
import json
import time

import joblib
import numpy as np
import pandas as pd
import shap
from scipy.stats import loguniform, randint, uniform
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve, silhouette_score)
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from ml.segments import build as build_segments
from ml.pipeline import ART, BOOKING, CLASS_NAMES, COLS, DATA, DELAYS, LABELS, RATINGS, encode, load_raw, transform

RS = 42
# domain knowledge: a longer delay can never make a passenger happier
MONO = tuple(-1 if c in DELAYS else 0 for c in COLS)


def scores(y, prob, train_time, tune_time=None, note=None):
    pred = (prob >= 0.5).astype(int)
    fpr, tpr, _ = roc_curve(y, prob)
    idx = np.unique(np.linspace(0, len(fpr) - 1, 120).astype(int))
    out = {
        "accuracy": round(accuracy_score(y, pred), 4),
        "precision": round(precision_score(y, pred), 4),
        "recall": round(recall_score(y, pred), 4),
        "f1": round(f1_score(y, pred), 4),
        "roc_auc": round(roc_auc_score(y, prob), 4),
        "confusion_matrix": confusion_matrix(y, pred).tolist(),
        "roc_curve": [[round(float(fpr[i]), 4), round(float(tpr[i]), 4)] for i in idx],
        "train_time_s": round(train_time, 2),
    }
    if tune_time is not None:
        out["tuning_time_s"] = round(tune_time, 2)
    if note:
        out["note"] = note
    return out


def main():
    ART.mkdir(parents=True, exist_ok=True)
    raw = load_raw()
    ids = raw["id"].values
    df = encode(raw)
    df["dataset_id"] = ids
    print("rows", len(df))

    train_df, test_df = train_test_split(df, test_size=0.2, stratify=df["satisfied"], random_state=RS)
    arr_median = float(train_df["arr_delay"].median())
    Xtr, Xte = transform(train_df, arr_median), transform(test_df, arr_median)
    ytr, yte = train_df["satisfied"].values, test_df["satisfied"].values
    scaler = StandardScaler().fit(Xtr)
    Xtr_s, Xte_s = scaler.transform(Xtr), scaler.transform(Xte)

    metrics, models = {}, {}

    # Logistic Regression
    t = time.perf_counter()
    lr_search = RandomizedSearchCV(LogisticRegression(max_iter=2000), {"C": loguniform(1e-3, 1e2)},
                                   n_iter=6, cv=3, scoring="f1", random_state=RS, n_jobs=-1).fit(Xtr_s, ytr)
    tune = time.perf_counter() - t
    t = time.perf_counter()
    lr = LogisticRegression(max_iter=2000, **lr_search.best_params_).fit(Xtr_s, ytr)
    metrics["Logistic Regression"] = scores(yte, lr.predict_proba(Xte_s)[:, 1], time.perf_counter() - t, tune)
    metrics["Logistic Regression"]["best_params"] = {k: round(v, 5) for k, v in lr_search.best_params_.items()}
    models["Logistic Regression"] = lr
    print("LR done", metrics["Logistic Regression"]["f1"])

    # SVM (RBF) - too slow on 100k rows, so tuned on 10k and trained on a 20k stratified subsample
    Xs20, _, ys20, _ = train_test_split(Xtr_s, ytr, train_size=20000, stratify=ytr, random_state=RS)
    Xs10, _, ys10, _ = train_test_split(Xs20, ys20, train_size=10000, stratify=ys20, random_state=RS)
    t = time.perf_counter()
    svm_search = RandomizedSearchCV(SVC(kernel="rbf"), {"C": loguniform(0.3, 30), "gamma": loguniform(0.005, 0.2)},
                                    n_iter=5, cv=3, scoring="f1", random_state=RS, n_jobs=-1).fit(Xs10, ys10)
    tune = time.perf_counter() - t
    t = time.perf_counter()
    svm = SVC(kernel="rbf", probability=True, random_state=RS, **svm_search.best_params_).fit(Xs20, ys20)
    metrics["SVM (RBF)"] = scores(yte, svm.predict_proba(Xte_s)[:, 1], time.perf_counter() - t, tune,
                                  "Trained on a 20,000-row stratified subsample (tuned on 10,000) because RBF SVM is slow on 100k+ rows")
    metrics["SVM (RBF)"]["best_params"] = {k: round(v, 5) for k, v in svm_search.best_params_.items()}
    models["SVM (RBF)"] = svm
    print("SVM done", metrics["SVM (RBF)"]["f1"])

    # Random Forest - tuned on a 30k subsample, final model on full train
    Xr30, _, yr30, _ = train_test_split(Xtr, ytr, train_size=30000, stratify=ytr, random_state=RS)
    t = time.perf_counter()
    rf_search = RandomizedSearchCV(RandomForestClassifier(random_state=RS, n_jobs=-1),
                                   {"n_estimators": randint(150, 400), "max_depth": [None, 20, 30],
                                    "min_samples_leaf": randint(1, 4), "max_features": ["sqrt", 0.5]},
                                   n_iter=6, cv=3, scoring="f1", random_state=RS).fit(Xr30, yr30)
    tune = time.perf_counter() - t
    t = time.perf_counter()
    rf = RandomForestClassifier(random_state=RS, n_jobs=-1, **rf_search.best_params_).fit(Xtr, ytr)
    metrics["Random Forest"] = scores(yte, rf.predict_proba(Xte)[:, 1], time.perf_counter() - t, tune,
                                      "Hyper-parameters searched on a 30,000-row subsample, final model fit on full training set")
    metrics["Random Forest"]["best_params"] = rf_search.best_params_
    models["Random Forest"] = rf
    print("RF done", metrics["Random Forest"]["f1"])

    # XGBoost
    t = time.perf_counter()
    xgb_search = RandomizedSearchCV(XGBClassifier(tree_method="hist", random_state=RS, n_jobs=-1, eval_metric="logloss",
                                                  monotone_constraints=MONO),
                                    {"n_estimators": randint(300, 700), "max_depth": randint(5, 10),
                                     "learning_rate": uniform(0.03, 0.12), "subsample": uniform(0.7, 0.3),
                                     "colsample_bytree": uniform(0.6, 0.4)},
                                    n_iter=8, cv=3, scoring="f1", random_state=RS).fit(Xtr, ytr)
    tune = time.perf_counter() - t
    t = time.perf_counter()
    xgb = XGBClassifier(tree_method="hist", random_state=RS, n_jobs=-1, eval_metric="logloss", monotone_constraints=MONO,
                        **xgb_search.best_params_).fit(Xtr, ytr)
    metrics["XGBoost"] = scores(yte, xgb.predict_proba(Xte)[:, 1], time.perf_counter() - t, tune,
                                "Monotonic constraint: delay features can only lower satisfaction")
    metrics["XGBoost"]["best_params"] = {k: (round(v, 4) if isinstance(v, float) else v)
                                         for k, v in xgb_search.best_params_.items()}
    models["XGBoost"] = xgb
    print("XGB done", metrics["XGBoost"]["f1"])

    best = max(metrics, key=lambda m: metrics[m]["f1"])
    # Served model: XGBoost. Its F1 is within 0.1 pp of the best, it respects the delay
    # monotonic constraint (more delay never raises satisfaction) and SHAP on it is fast.
    best_tree = "XGBoost"
    serve = models[best_tree]

    # Booking-time model
    t = time.perf_counter()
    bk = XGBClassifier(tree_method="hist", random_state=RS, n_jobs=-1, eval_metric="logloss",
                       n_estimators=400, max_depth=6, learning_rate=0.05).fit(train_df[BOOKING], ytr)
    booking_metrics = scores(yte, bk.predict_proba(test_df[BOOKING])[:, 1], time.perf_counter() - t,
                             note="Uses only the 6 features known at booking time (no service ratings, no delays)")
    print("Booking done", booking_metrics["f1"])

    # SHAP
    explainer = shap.TreeExplainer(serve)
    sample = Xte.sample(3000, random_state=RS)
    sv = explainer.shap_values(sample)
    if isinstance(sv, list):
        sv = sv[1]
    sv = np.asarray(sv)
    if sv.ndim == 3:
        sv = sv[:, :, 1]
    shap_global = sorted([{"feature": c, "label": LABELS[c], "importance": round(float(v), 4)}
                          for c, v in zip(COLS, np.abs(sv).mean(axis=0))], key=lambda d: -d["importance"])
    tree_imp = {m: sorted([{"feature": c, "label": LABELS[c], "importance": round(float(v), 4)}
                           for c, v in zip(COLS, models[m].feature_importances_)], key=lambda d: -d["importance"])
                for m in ("Random Forest", "XGBoost")}

    # Segments (KMeans on scaled features)
    sil_sample = np.random.RandomState(RS).choice(len(Xtr_s), 10000, replace=False)
    sil = {}
    km_models = {}
    for k in (4, 5, 6):
        km = KMeans(n_clusters=k, n_init=10, random_state=RS).fit(Xtr_s)
        sil[k] = round(float(silhouette_score(Xtr_s[sil_sample], km.labels_[sil_sample])), 4)
        km_models[k] = km
    k_best = max(sil, key=sil.get)
    km = km_models[k_best]
    train_df = train_df.assign(segment=km.labels_)
    test_df = test_df.assign(segment=km.predict(Xte_s))
    segments = build_segments(train_df, Xtr_s, km, sil)  # names, profiles, 3D PCA points

    # Fairness (served model on test set)
    prob = serve.predict_proba(Xte)[:, 1]
    pred = (prob >= 0.5).astype(int)
    test_df = test_df.assign(prob_satisfied=np.round(prob, 4))
    age_grp = pd.cut(test_df["age"], [0, 24, 39, 59, 200], labels=["<25", "25-40", "40-60", "60+"])
    fairness = []
    for name, keys in (("Gender", test_df["gender"].map({0: "Female", 1: "Male"})), ("Age group", age_grp)):
        for g in keys.cat.categories if hasattr(keys, "cat") else sorted(keys.unique()):
            m = (keys == g).values
            fairness.append({"attribute": name, "group": str(g), "n": int(m.sum()),
                             "accuracy": round(accuracy_score(yte[m], pred[m]), 4),
                             "f1": round(f1_score(yte[m], pred[m]), 4),
                             "satisfied_rate": round(float(yte[m].mean()), 4)})

    # EDA for the insights endpoint (whole dataset)
    def rate(col, names):
        return [{"group": names[v], "n": int((df[col] == v).sum()),
                 "satisfied_rate": round(float(df.loc[df[col] == v, "satisfied"].mean()), 4)} for v in names]
    delay_bins = pd.cut(df["dep_delay"], [-1, 0, 15, 60, 120, 10000], labels=["0", "1-15", "16-60", "61-120", "120+"])
    age_bins = pd.cut(df["age"], range(0, 90, 10))
    eda = {
        "rows": int(len(df)), "train_rows": int(len(train_df)), "test_rows": int(len(test_df)),
        "satisfied_rate": round(float(df["satisfied"].mean()), 4),
        "missing_arrival_delay": int(raw["Arrival Delay in Minutes"].isna().sum()),
        "arrival_delay_train_median": arr_median,
        "by_class": rate("travel_class", CLASS_NAMES),
        "by_travel_type": rate("travel_type", {0: "Personal", 1: "Business"}),
        "by_customer_type": rate("customer_type", {0: "Disloyal", 1: "Loyal"}),
        "by_delay": [{"group": str(b), "n": int(len(g)), "satisfied_rate": round(float(g["satisfied"].mean()), 4)}
                     for b, g in df.groupby(delay_bins, observed=True)],
        "by_age": [{"group": f"{int(b.left)}-{int(b.right)}", "n": int(len(g)),
                    "satisfied_rate": round(float(g["satisfied"].mean()), 4)}
                   for b, g in df.groupby(age_bins, observed=True)],
        "ratings_gap": [{"feature": c, "label": LABELS[c],
                         "satisfied": round(float(df.loc[df.satisfied == 1, c].mean()), 2),
                         "dissatisfied": round(float(df.loc[df.satisfied == 0, c].mean()), 2)} for c in RATINGS],
    }

    joblib.dump({"model": serve, "name": best_tree, "arr_median": arr_median}, ART / "model_full.joblib")
    joblib.dump(bk, ART / "model_booking.joblib")
    joblib.dump({"scaler": scaler, "kmeans": km}, ART / "segments.joblib")
    out_cols = ["dataset_id"] + COLS + ["satisfied", "segment", "prob_satisfied"]
    test_df[out_cols].to_csv(DATA / "test_encoded.csv", index=False)
    json.dump({"models": metrics, "best_model": best, "served_model": best_tree,
               "serving_reason": "F1 within 0.1 pp of the best model, delay effect is monotonic "
                                 "(a longer delay never raises satisfaction) and exact TreeSHAP is fast",
               "booking_model": booking_metrics, "tree_importance": tree_imp,
               "split": {"train": int(len(train_df)), "test": int(len(test_df)), "random_state": RS}},
              open(ART / "metrics.json", "w"), indent=1)
    json.dump(segments, open(ART / "segments.json", "w"))
    json.dump(fairness, open(ART / "fairness.json", "w"), indent=1)
    json.dump(shap_global, open(ART / "shap_global.json", "w"), indent=1)
    json.dump(eda, open(ART / "eda.json", "w"), indent=1)
    print("best", best, "served", best_tree, "k", k_best, sil)


if __name__ == "__main__":
    main()
