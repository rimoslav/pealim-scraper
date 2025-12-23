"use client";

import { useState, FormEvent } from "react";
import styles from "./page.module.css";


type PartOfSpeech = "noun" | "adjective" | "verb" | "_NONE_";

export default function Home() {
  const [url, setUrl] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState<PartOfSpeech>("_NONE_");
  const [useChToKh, setUseChToKh] = useState(true);
  const [useTzToC, setUseTzToC] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    setIsLoading(true);
    setSuccessMessage("");
    setErrorMessage("");

    // Prepare request body - only include partOfSpeech if it's not _NONE_
    const requestBody: { url: string; useChToKh: boolean; useTzToC: boolean; partOfSpeech?: string } = {
      url,
      useChToKh,
      useTzToC
    };
    
    if (partOfSpeech !== "_NONE_") {
      requestBody.partOfSpeech = partOfSpeech;
    }

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      // Check if the response contains an error
      if (!response.ok || data.error) {
        setErrorMessage(data.error || "Failed to parse the page.");
        setTimeout(() => setErrorMessage(""), 5000);
        return;
      }
      
      console.log("Parsed data:", data);
      
      // Open HTML file if it was generated
      if (data.htmlContent) {
        const blob = new Blob([data.htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        // Clean up the URL after a short delay
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      }
      
      // Show success message and clear input
      setSuccessMessage("Success! HTML file generated and opened.");
      setUrl("");
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Error: Failed to parse the page.");
      setTimeout(() => setErrorMessage(""), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Pealim Scraper</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="url" className={styles.label}>
              Pealim URL
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.pealim.com/..."
              className={styles.input}
              required
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="partOfSpeech" className={styles.label}>
              Part of speech
            </label>
            <select
              id="partOfSpeech"
              value={partOfSpeech}
              onChange={(e) => setPartOfSpeech(e.target.value as "noun" | "adjective" | "verb")}
              className={partOfSpeech === "_NONE_" ? `${styles.select} ${styles.selectDisabled}` : styles.select}
            >
              <option value="_NONE_">Select part of speech</option>
              <option value="noun">Noun</option>
              <option value="adjective">Adjective</option>
              <option value="verb">Verb</option>
            </select>
          </div>

          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={useChToKh}
                onChange={(e) => setUseChToKh(e.target.checked)}
                className={styles.checkbox}
              />
              Transliterate ך, כ and ח as kh
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={useTzToC}
                onChange={(e) => setUseTzToC(e.target.checked)}
                className={styles.checkbox}
              />
              Transliterate צ and ץ as c
            </label>
          </div>

          <button 
            type="submit" 
            className={styles.submitButton}
            disabled={!url.trim() || isLoading}
          >
            {isLoading ? "Working..." : "Submit"}
          </button>
          
          {successMessage && (
            <div className={styles.successMessage}>
              {successMessage}
            </div>
          )}
          
          {errorMessage && (
            <div className={styles.errorMessage}>
              {errorMessage}
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
