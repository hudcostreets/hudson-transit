# PATH ridership stats
Cleaned + Plotted Port Authority data from https://www.panynj.gov/path/en/about/stats.html

## Cleaned data
- [`data/all.pqt`]
- [`data/all.xlsx`]
- [Google Sheet](https://docs.google.com/spreadsheets/d/1u84kVHEjvqByCu8Jb78D9f7TXbahoOe0/edit)

### Jan 2012 – Feb 2023
![PATH weekday ridership over time, stacked by station](img/weekdays.png)

### Closer look at 2020-Present
![PATH weekday ridership over time, stacked by station, 2020 to 2022-09; 275k in Jan/Feb 2020, large drop, almost to zero, in April 2020, steadily climbing back to 150k](img/weekdays_2020:.png)

### Weekends only
![PATH weekend ridership over time, stacked by station](img/weekends.png)

### Weekends (2020-Present)
![PATH Saturday ridership over time, stacked by station, September 2022 has surpassed January/February 2020](img/weekends_2020:.png)

### Weekdays, Grouped by Month
![](img/avg%20weekday_month_grouped.png)

### Weekends, Grouped by Month
![](img/avg%20weekend_month_grouped.png)

### Weekdays vs. Weekends
![](img/avg_day_types.png)

### Weekdays vs. Weekends, compared to 2019
![](img/vs_2019.png)


## Methods

### PATH Monthly Data

#### 1. Download "PATH Ridership Reports (By Month)"
- from https://www.panynj.gov/path/en/about/stats.html
- to [`data/`](data/)

#### 2. Use [Tabula] to extract tables

![Selecting tables from a "PATH Ridership Report"](img/tabula-screenshot.png)

Resulting templates in [`templates/`](templates).

#### 3. Process each year's data, output `.pqt`s
See:
- [`monthly.ipynb`](monthly.ipynb)
- outputs in [`data/*.pqt`](data/)

#### 4. Combine all years' data
- See [`months.ipynb`](months.ipynb)
- Output [`data/all.pqt`], [`data/all.xlsx`], [`img/weekdays.png`](img/weekdays.png)

### Bridge & Tunnel Data

Merge per-year PDFs into one:
```bash
/opt/homebrew/bin/gs \
  -o merged.pdf \
  -sDEVICE=pdfwrite \
  -dPDFFitPage \
  -g12984x10033 \
  -dPDFSETTINGS=/prepress \ 
  traffic-e-zpass-usage-20*
```
cf. [SO](https://stackoverflow.com/a/28455147/544236).


[`data/all.pqt`]: data/all.pqt
[`data/all.xlsx`]: data/all.xlsx
[Tabula]: https://tabula.technology/
