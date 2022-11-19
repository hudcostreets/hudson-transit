# PATH ridership stats
Cleaned + Plotted Port Authority data from https://www.panynj.gov/path/en/about/stats.html

### Jan 2012 – Sept 2022
![PATH weekday ridership over time, stacked by station](img/weekdays.png)

### Jan 2020 – Sept 2022
![PATH weekday ridership over time, stacked by station, 2020 to 2022-09; 275k in Jan/Feb 2020, large drop, almost to zero, in April 2020, steadily climbing back to 150k](img/weekdays_2020:.png)

### Saturdays
![PATH Saturday ridership over time, stacked by station, September 2022 has surpassed January/February 2020](img/saturdays.png)

Cleaned data:
- [`data/all.pqt`]
- [`data/all.xlsx`]
- [Google Sheet](https://docs.google.com/spreadsheets/d/1u84kVHEjvqByCu8Jb78D9f7TXbahoOe0/edit)

## Methods

### 1. Download "PATH Ridership Reports (By Month)"
- from https://www.panynj.gov/path/en/about/stats.html
- to [`data/`](data/)

### 2. Use [Tabula] to extract tables

![Selecting tables from a "PATH Ridership Report"](img/tabula-screenshot.png)

Resulting templates in [`templates/`](templates).

### 3. Process each year's data, output `.pqt`s
See:
- [`monthly.ipynb`](monthly.ipynb)
- outputs in [`data/*.pqt`](data/)

### 4. Combine all years' data
- See [`months.ipynb`](months.ipynb)
- Output [`data/all.pqt`], [`data/all.xlsx`], [`img/weekdays.png`](img/weekdays.png)

[`data/all.pqt`]: data/all.pqt
[`data/all.xlsx`]: data/all.xlsx
[Tabula]: https://tabula.technology/
