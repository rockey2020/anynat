### 介绍

Anynat是一款通用性极强的内网穿透工具,能够适应复杂的内网环境,在较差的网络条件下,仍然能够提供稳定可靠的数据传输.

### 安装方式
1. docker容器化部署Anynat(推荐)
2. npm安装方式(不推荐)

*** 阅读本文档之前,会默认您有一定的网络知识,例如如何输入命令,怎样配置和解析域名等,文档不再赘述,自行搜索相关答案 ***

*** 本文档仅提供docker部署方法,如果采用npm安装方式,则默认您具有一定的编程知识,需要自行摸索和解决npm相关问题 ***

### docker容器化部署Anynat
1. Anynat需要同时部署服务端和客户端
   1. 服务端是指具有公网IP的服务器.例如阿里云,腾讯云的服务器,当然也有一些第三方免费的服务器,需要自行准备
   2. 客户端是指你的内网服务器.例如你的nas,台式电脑,笔记本或者其他系统平台,需要暴露自己本地的服务给外面的人访问就是客户,需要自行准备
2. 部署服务端/客户端之前,建议准备一个干净的系统,只安装docker相关的软件依赖
   1. 部署docker的教程文档(** 服务端和客户端都需要安装好docker **):
      1. ubuntu/linux/macos教程:https://docs.docker.com/engine/install/ubuntu/
      2. windows教程:https://docs.docker.com/desktop/install/windows-install/
      3. 中文安装教程:https://zhuanlan.zhihu.com/p/441965046
      4. 其他语言的docker安装方法自行搜索
3. 建议提前准备好一个域名,没有域名也没问题,有公网IP即可.需要提前将域名开启HTTPS并解析到您的服务器公网IP,推荐使用cloudflare作为域名解析平台
4. 服务端和客户端共用同一份配置文件,如果配置对不上,则无法使用内网穿透服务,每次修改好配置需要重启Anynat容器/重启系统
5. [点击阅读服务端安装方法](https://anynat.next-app.cc/docs/install-server "Anynat服务端部署方法")
6. [点击阅读客户端安装方法](https://anynat.next-app.cc/docs/install-client "Anynat客户端部署方法")
