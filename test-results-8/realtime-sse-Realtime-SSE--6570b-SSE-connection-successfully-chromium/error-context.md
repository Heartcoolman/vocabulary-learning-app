# Page snapshot

```yaml
- generic [ref=e3]:
    - banner [ref=e4]:
        - generic [ref=e6]:
            - link "返回首页" [ref=e7] [cursor=pointer]:
                - /url: /
                - heading "词汇学习" [level=1] [ref=e8]
            - navigation "主导航" [ref=e9]:
                - link "学习" [ref=e10] [cursor=pointer]:
                    - /url: /
                - link "词库管理" [ref=e11] [cursor=pointer]:
                    - /url: /vocabulary
                - link "学习设置" [ref=e12] [cursor=pointer]:
                    - /url: /study-settings
                - link "学习历史" [ref=e13] [cursor=pointer]:
                    - /url: /history
                - button "学习洞察" [ref=e15] [cursor=pointer]:
                    - text: 学习洞察
                    - img [ref=e17]
                - link "个人资料 - testuser" [ref=e19] [cursor=pointer]:
                    - /url: /profile
                    - text: testuser
                - button "Toggle theme" [ref=e20] [cursor=pointer]:
                    - generic [ref=e21]:
                        - img [ref=e23]
                        - generic:
                            - img
    - main [ref=e25]:
        - generic [ref=e27]:
            - img [ref=e29]
            - heading "暂无单词" [level=2] [ref=e32]
            - paragraph [ref=e33]: 你还没有添加任何单词，请先选择词书或添加单词
            - generic [ref=e34]:
                - button "选择词书" [ref=e35] [cursor=pointer]
                - button "添加单词" [ref=e36] [cursor=pointer]
```
