---
title: 你好，世界
description: 博客搭建完成后的第一篇，聊聊为什么要有一个自己的角落。
pubDate: 2026-06-20
tags: ['随笔', '开始']
cover: /covers/hello.svg
---

很多东西写在备忘录里，写着写着就散了。所以有了这个博客——一个能长期沉淀想法的地方。

## 为什么自己搭

- **数据在自己手里**：文章都是本地的 Markdown 文件，纯文本，几十年后也能打开。
- **足够快、足够静**：静态站点，没有多余的脚本打扰阅读。
- **可以慢慢长**：先有个能跑的骨架，之后想加什么再加什么。

> 先完成，再完美。

## 接下来

计划写一些后端工程、系统设计相关的笔记，偶尔也放点随笔。

```java
public record Post(String title, LocalDate date) {
    public boolean isRecent() {
        return date.isAfter(LocalDate.now().minusDays(30));
    }
}
```

就从这里开始吧。
