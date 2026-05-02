const STUDENT_PROFILE_STORAGE_KEY = "music-theory-student-profile";

export function getStudentProfile() {
  if (typeof window === "undefined") {
    return { studentId: "student-local", studentLabel: "本地学生" };
  }

  const cached = window.localStorage.getItem(STUDENT_PROFILE_STORAGE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed?.studentId) {
        const label = String(parsed.studentLabel || "");
        const hasGarbledLabel = /[\uFFFD\u701B\u93C8\uE100\u6E74]|\u701B\uFE3E\u6553|\u93C8\uE100\u6E74/.test(label)
          && !/学生|本地学生/.test(label);
        if (hasGarbledLabel) {
          const repaired = {
            ...parsed,
            studentLabel: `学生 ${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
          };
          window.localStorage.setItem(STUDENT_PROFILE_STORAGE_KEY, JSON.stringify(repaired));
          return repaired;
        }
        return parsed;
      }
    } catch {}
  }

  const profile = {
    studentId: `student-${Math.random().toString(36).slice(2, 10)}`,
    studentLabel: `学生 ${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
  };
  window.localStorage.setItem(STUDENT_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}
